const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/authMiddleware');
const citizenOnly = require('../middleware/citizenOnly');
const adminOnly = require('../middleware/adminOnly');
const departmentOnly = require('../middleware/departmentOnly');
const { complaintIpLimiter, complaintDeviceLimiter } = require('../middleware/rateLimiters');
const { firewallSanitizeMiddleware } = require('../middleware/firewallSanitize');
const earlyVerificationMiddleware = require('../middleware/earlyVerification');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { analyzeComplaint } = require('../../ai-services/aiService');
const { transcribeAudio } = require('../../ai-services/speechService');
const { sendEmailNotification } = require('../../ai-services/emailService');
const { appendAuditLog } = require('../services/auditService');
const { runStages4567, parseClientGps, descriptionShingles, categoryToDept } = require('../services/verificationRunner');
const config = require('../config/verificationConfig');

// Civic_issue integration: Fraud detection + Image forensics
const { detectComplaintFraud } = require('../utils/fraudDetection');
const { getHfFraudScore } = require('../utils/huggingFraudService');
const { inspectComplaintPhoto } = require('../utils/imageForensics');
const { validateImageComplaint } = require('../utils/imageComplaintValidator');
const { getClipAlignmentScore } = require('../utils/clipVisionService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function buildTrackingId(category) {
  const dept = categoryToDept(category);
  const ts = Date.now().toString(36);
  const seg = uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `${dept}-${ts}-${seg}`;
}

async function applyFakeTrustPenalty(userId) {
  const user = await User.findById(userId);
  if (!user) return;
  user.trustScore = Math.max(0, user.trustScore - config.trust.fakePenalty);
  user.fakeFlagsLast30d = (user.fakeFlagsLast30d || 0) + 1;
  user.lastFakeFlagAt = new Date();
  if (user.fakeFlagsLast30d >= config.fakeFlagsBanThreshold) {
    user.submissionBannedUntil = new Date(Date.now() + 7 * 86400000);
  }
  await user.save();
}

// ═══════════════════════════════════════════════════════════════
// CITIZEN: Submit complaint
// ═══════════════════════════════════════════════════════════════
router.post(
  '/',
  authMiddleware,
  citizenOnly,
  complaintIpLimiter,
  complaintDeviceLimiter,
  firewallSanitizeMiddleware,
  earlyVerificationMiddleware,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'photo', maxCount: 1 }]),
  async (req, res) => {
    const audioFile = req.files?.audio?.[0] || null;
    const photoFile = req.files?.photo?.[0] || null;
    const user = req.citizenUser;
    const name = req.body.name || user.name;
    const location = req.body.location || 'Unknown';

    try {
      // 1. Initial Data Extraction (Fast)
      let text = req.body.text;
      if (audioFile) {
        text = await transcribeAudio(audioFile.buffer);
      }
      if (!text) return res.status(400).json({ error: 'Either text or audio is required' });

      // Pre-AI Validation: Length and Gibberish detection
      const cleanText = text.trim();
      console.log('[DEBUG] Input Text:', cleanText);
      const isTooShort = cleanText.length < 3; // Reduced from 5 to 3 for ultra-concise regional words
      
      // Better Gibberish detection: Only apply "consonant-heavy" check to Latin text
      const isLatin = /^[A-Z0-9\s.,!?-]+$/i.test(cleanText);
      const isKeyboardSmash = isLatin 
        ? (/[^aeiouy\s]{8,}/i.test(cleanText) || /(.)\1{5,}/.test(cleanText))
        : (/(.)\1{6,}/.test(cleanText)); // More lenient for Non-Latin scripts

      if (isTooShort || isKeyboardSmash) {
        return res.status(422).json({ decision: 'FAKE', error: 'invalid description', trackingId: `REJ-${uuidv4().slice(0, 8).toUpperCase()}` });
      }

      // 2. Parallel Core AI & Data Fetching
      const photoBuffer = photoFile ? photoFile.buffer : (req.body.image?.startsWith('data:image') ? Buffer.from(req.body.image.split(',')[1], 'base64') : null);
      
      const [aiResult, recentComplaints, photoResult, ruleResult] = await Promise.all([
        analyzeComplaint(text, name, location),
        Complaint.find({ createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }).sort({ createdAt: -1 }).limit(50).select('complaintText textEmbedding trackingId'),
        photoBuffer ? inspectComplaintPhoto(photoBuffer) : Promise.resolve({ ok: false }),
        detectComplaintFraud({ Complaint, userId: user._id?.toString(), text, location, sourceIp: req.ip })
      ]);

      console.log('[DEBUG] AI Analysis Result:', aiResult);

      if (aiResult.category === 'Irrelevant') {
        console.warn('[Complaint Rejected] Category: Irrelevant', { text, aiResult });
        return res.status(422).json({ decision: 'FAKE', error: 'invalid description', trackingId: `REJ-${uuidv4().slice(0, 8).toUpperCase()}` });
      }

      // 3. Dependent Parallel Tasks (Vision Alignment + Verification Stages)
      const [clipScore, hfResult, stage456] = await Promise.all([
        photoBuffer ? getClipAlignmentScore(photoBuffer, text) : Promise.resolve(null),
        getHfFraudScore(text, recentComplaints),
        runStages4567({ user, body: { ...req.body, text }, aiResult, stage23: req.verificationStage23 })
      ]);

      // 4. Semantic Gateway & Fraud Compilation
      const imageValidation = photoBuffer ? await validateImageComplaint({
        complaintText: text, imageCaption: photoResult.caption || '', detectedObjects: photoResult.detectedObjects || [],
        photoHash: photoResult.hash, hasExifData: !!photoResult.capturedAt, visualSignature: photoResult.visualSignature || {}, clipScore
      }) : { alignmentScore: 100, isFraud: false, fraudScore: 0 };

      // STRICTOR REJECTION: High Fraud Score or Semantic Mismatch
      if (imageValidation.isFraud && imageValidation.fraudScore >= 85) {
        return res.status(400).json({ decision: 'FAKE', error: `Verification Failed: ${imageValidation.reason}` });
      }
      
      const matchPercentage = imageValidation.alignmentScore;
      if (photoBuffer && matchPercentage < 40) { // Increased from 20 to 40
        return res.status(400).json({ 
          decision: 'FAKE', 
          error: `Verification Failed: Image mismatch (${matchPercentage}% coherence). Please attach a real photo of the specific issue.` 
        });
      }

      // Fraud score aggregation
      let fraudScore = Math.max(ruleResult.fraudScore, hfResult.score);
      let fraudReasons = [...ruleResult.fraudReasons, ...(hfResult.reasons || [])];
      
      if (imageValidation.isFraud) {
        fraudScore = Math.min(fraudScore + imageValidation.fraudScore, 100);
        fraudReasons.push(`[IMAGE] ${imageValidation.reason}`);
      } else if (photoBuffer) {
        fraudReasons.push(`[IMAGE] ✓ Visual evidence aligns (${matchPercentage}%).`);
      }

      if (matchPercentage < 60 && photoBuffer) { // Flag if borderline
        fraudScore = Math.max(fraudScore, 65);
        fraudReasons.push(`[SEMANTIC] Borderline coherence (${matchPercentage}%).`);
      }

      const fraudFields = {
        fraudScore: Math.min(fraudScore, 100),
        fraudStatus: fraudScore >= 75 ? 'Flagged' : fraudScore >= 45 ? 'Suspicious' : 'Clean',
        fraudReasons,
        sourceIp: req.ip,
        textEmbedding: hfResult.embedding || null,
        photoHash: photoResult.hash,
        photoCapturedAt: photoResult.capturedAt || null,
        photoGeo: photoResult.gps || null
      };

      // 5. Final Decision & Storage
      const { finalScore, decision, textEmb, imageEmb, bestDuplicate, shingles } = stage456;
      
      // Override decision if fraud score is critical
      let finalDecision = decision;
      if (fraudScore >= 90 && decision !== 'DUPLICATE') finalDecision = 'FAKE';

      const trackingId = finalDecision === 'FAKE' ? `REJ-${uuidv4().slice(0, 12)}` : (finalDecision === 'DUPLICATE' ? `DUP-${uuidv4().slice(0, 8)}` : buildTrackingId(aiResult.category));
      
      const gps = parseClientGps(req.body);
      const geoLocation = gps ? { type: 'Point', coordinates: [gps.lng, gps.lat] } : undefined;

      const complaintData = {
        user: user._id, name, location, complaintText: text, category: aiResult.category, priority: aiResult.priority, 
        summary: aiResult.summary, image: req.body.image, emailDraft: aiResult.emailDraft, trackingId,
        verificationScore: finalScore, verificationDecision: finalDecision, flags: [...(req.verificationStage23.flags || []), ...stage456.flags],
        fingerprint: req.body.fingerprint, exifData: req.exifData, geoLocation, lat: gps?.lat, lng: gps?.lng, ipAddress: req.ip,
        embeddings: { text: textEmb || [], image: imageEmb || [] }, departmentCode: categoryToDept(aiResult.category), 
        descriptionShingles: shingles, verificationDetails: { ...req.verificationStage23.results, ...stage456.results456 },
        status: finalDecision === 'FAKE' ? 'Rejected' : (finalDecision === 'DUPLICATE' ? 'Merged' : 'Pending'),
        ...fraudFields
      };

      const complaint = await Complaint.create(complaintData);

      // 6. Respond Fast (Wait only for DB write)
      const responsePayload = {
        ...complaint.toObject(),
        trackingId,
        decision: finalDecision,
        emailSent: finalDecision === 'REAL', // Optimistic for UI
      };

      if (finalDecision === 'DUPLICATE') {
        const existing = await Complaint.findById(bestDuplicate?.id).select('trackingId');
        responsePayload.linkedTrackingId = existing?.trackingId;
        responsePayload.merged = true;
      }

      res.status(finalDecision === 'FAKE' ? 422 : 201).json(responsePayload);

      // 7. Background Tasks (Post-Response)
      process.nextTick(async () => {
        try {
          // Audit Log
          const auditEntries = [
            { stage: 1, name: 'firewall', flags: [], partialScore: 100 },
            { stage: 2, name: 'trust', flags: req.verificationStage23.flags || [], partialScore: req.verificationStage23.results.stage2.contribution },
            { stage: 3, name: 'geo', flags: req.verificationStage23.flags || [], partialScore: req.verificationStage23.results.stage3.contribution },
            { stage: 4, name: 'ai_ml', flags: stage456.flags, partialScore: stage456.results456.stage4.contribution }
          ];
          await appendAuditLog({ complaintId: complaint._id, stageResults: complaint.verificationDetails, finalScore, decision: finalDecision, entries: auditEntries });

          // Email Notification
          if (finalDecision === 'REAL') {
             await sendEmailNotification(complaint);
          }

          // Penalties
          if (finalDecision === 'FAKE') {
            await applyFakeTrustPenalty(user._id);
          }
        } catch (bgErr) {
          console.error('[Background Task Error]:', bgErr);
        }
      });

    } catch (error) {
      console.error('Complaint processing error:', error);
      res.status(500).json({ error: 'Failed to process complaint' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// ADMIN: Fraud analytics
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/fraud', authMiddleware, adminOnly, async (req, res) => {
  try {
    const byFlag = await Complaint.aggregate([
      { $match: { flags: { $exists: true, $ne: [] } } },
      { $unwind: '$flags' },
      { $group: { _id: '$flags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 25 }
    ]);
    const byDecision = await Complaint.aggregate([
      { $group: { _id: '$verificationDecision', count: { $sum: 1 } } }
    ]);
    const byCategory = await Complaint.aggregate([
      { $match: { verificationDecision: 'FAKE' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ byFlag, byDecision, fakeByCategory: byCategory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Audit trail for a complaint
// ═══════════════════════════════════════════════════════════════
router.get('/audit/:complaintId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await AuditLog.find({ complaintId: req.params.complaintId }).sort({ createdAt: 1 });
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Get department summary (counts per department)
// ═══════════════════════════════════════════════════════════════
router.get('/departments/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    
    const summary = await Complaint.aggregate([
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $in: ['$status', ['Pending', 'QueuedReview', 'InProgress']] }, 1, 0] }
          },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] }
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['Pending', 'QueuedReview', 'InProgress']] },
                    { $lte: ['$createdAt', oneDayAgo] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Get complaints by department/category
// ═══════════════════════════════════════════════════════════════
router.get('/by-department/:category', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { category } = req.params;
    const complaints = await Complaint.find({ category })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('trackingId name location complaintText summary category priority status createdAt resolvedAt departmentResponse resolutionImage escalations verificationDecision verificationScore image emailDraft flags fraudScore fraudStatus fraudReasons');
    res.json(complaints);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Escalate — raise question to department (complaint > 1 day)
// ═══════════════════════════════════════════════════════════════
router.post('/:id/escalate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Escalation message is required' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    // Check if complaint is older than 1 day
    const ageMs = Date.now() - new Date(complaint.createdAt).getTime();
    const oneDayMs = 1 * 24 * 60 * 60 * 1000;
    if (ageMs < oneDayMs) {
      return res.status(400).json({ error: 'Can only escalate complaints older than 1 day' });
    }

    // Check if already resolved
    if (complaint.status === 'Resolved') {
      return res.status(400).json({ error: 'Complaint is already resolved' });
    }

    complaint.escalations = complaint.escalations || [];
    complaint.escalations.push({
      raisedAt: new Date(),
      message: message.trim(),
      raisedBy: req.user?.id || 'admin'
    });

    await complaint.save();

    console.log(`[ESCALATION] Admin raised question for complaint ${complaint.trackingId}: "${message}"`);

    res.json({ ok: true, complaint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Get all complaints (legacy flat list)
// ═══════════════════════════════════════════════════════════════
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const complaints = await Complaint.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Verification override (keep existing)
// ═══════════════════════════════════════════════════════════════
router.put('/:id/verification-override', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!['REAL', 'HUMAN_REVIEW', 'FAKE', 'DUPLICATE', 'RELATED'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }
    const existing = await Complaint.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const previousDecision = existing.verificationDecision;

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      {
        verificationDecision: decision,
        status: decision === 'FAKE' ? 'Rejected' : decision === 'HUMAN_REVIEW' ? 'QueuedReview' : 'Pending'
      },
      { new: true }
    );

    const prevLog = await AuditLog.findOne().sort({ createdAt: -1 });
    const prevHash = prevLog ? prevLog.currentHash : '0';
    const crypto = require('crypto');
    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ override: true, complaintId: complaint._id, decision }) + prevHash)
      .digest('hex');

    await AuditLog.create({
      complaintId: complaint._id,
      stageResults: { override: true, previousDecision },
      finalScore: complaint.verificationScore,
      decision,
      previousHash: prevHash,
      currentHash,
      overrideReason: reason || '',
      overriddenBy: req.user?.id || 'admin',
      overriddenAt: new Date(),
      entries: [{ stage: 0, name: 'override', flags: [], partialScore: complaint.verificationScore }]
    });

    res.json({ ok: true, complaint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPARTMENT: Get own department complaints
// ═══════════════════════════════════════════════════════════════
router.get('/department/my', authMiddleware, departmentOnly, async (req, res) => {
  try {
    const dept = req.departmentUser.department;
    const complaints = await Complaint.find({ category: dept })
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .select('trackingId name location complaintText summary category priority status createdAt resolvedAt departmentResponse resolutionImage escalations verificationDecision image emailDraft fraudScore fraudStatus fraudReasons');
    res.json(complaints);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPARTMENT: Update complaint status (mark InProgress / Resolved)
// ═══════════════════════════════════════════════════════════════
router.put('/:id/department-update', authMiddleware, departmentOnly, async (req, res) => {
  try {
    const { status, response, resolutionImage } = req.body;
    if (!['InProgress', 'Resolved', 'Pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use InProgress, Resolved, or Pending.' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    // Verify this complaint belongs to their department
    const dept = req.departmentUser.department;
    if (complaint.category !== dept) {
      return res.status(403).json({ error: 'This complaint does not belong to your department' });
    }

    complaint.status = status;
    if (response) {
      complaint.departmentResponse = response;
    }
    if (status === 'Resolved') {
      if (!resolutionImage && !complaint.resolutionImage) {
        return res.status(400).json({ error: 'Proof of work (photo) is required to mark as Resolved.' });
      }
      
      if (resolutionImage) {
        complaint.resolutionImage = resolutionImage; // base64 string
      }
      complaint.resolvedAt = new Date();
      // Boost citizen trust score on resolution
      if (complaint.user) {
        const citizen = await User.findById(complaint.user);
        if (citizen) {
          citizen.trustScore = Math.min(100, (citizen.trustScore ?? 50) + (config.trust?.realBonus || 3));
          await citizen.save();
        }
      }
    } else {
      complaint.resolvedAt = null;
    }

    await complaint.save();
    res.json(complaint);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPARTMENT: Answer Admin Escalation
// ═══════════════════════════════════════════════════════════════
router.put('/:id/escalate/:escalationId/reply', authMiddleware, departmentOnly, async (req, res) => {
  try {
    const { answerReason, answerMessage, answerImage } = req.body;
    if (!['already resolved', 'no such problem exist', 'others'].includes(answerReason)) {
      return res.status(400).json({ error: 'Invalid answer reason.' });
    }

    if (answerReason !== 'others' && !answerImage) {
      return res.status(400).json({ error: 'Photo proof is required for this answer.' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const dept = req.departmentUser.department;
    if (complaint.category !== dept) {
      return res.status(403).json({ error: 'This complaint does not belong to your department' });
    }

    const escalation = complaint.escalations.id(req.params.escalationId);
    if (!escalation) return res.status(404).json({ error: 'Escalation not found' });

    if (escalation.answeredAt) {
      return res.status(400).json({ error: 'This escalation has already been answered.' });
    }

    escalation.answeredAt = new Date();
    escalation.answerReason = answerReason;
    escalation.answerMessage = answerMessage;
    if (answerImage) escalation.answerImage = answerImage;

    // Apply auto-status updates
    if (answerReason === 'already resolved') {
      complaint.status = 'Resolved';
      complaint.resolvedAt = new Date();
      complaint.resolutionImage = answerImage;
      
      // Trust score boost logic
      if (complaint.user) {
        const citizen = await User.findById(complaint.user);
        if (citizen) {
          citizen.trustScore = Math.min(100, (citizen.trustScore ?? 50) + (config.trust?.realBonus || 3));
          await citizen.save();
        }
      }
    } else if (answerReason === 'no such problem exist') {
      complaint.status = 'Rejected';
      complaint.departmentResponse = answerMessage || 'Rejected by department: No such problem exists.';
    }

    await complaint.save();
    res.json(complaint);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
