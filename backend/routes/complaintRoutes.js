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

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
  upload.single('audio'),
  async (req, res) => {
    console.log('Incoming Complaint Submission:', { bodyKeys: Object.keys(req.body || {}), file: !!req.file, user: req.user.id });
    try {
      let text = req.body.text;
      if (req.file) {
        text = await transcribeAudio(req.file.buffer);
      }
      if (!text) {
        return res.status(400).json({ error: 'Either text or audio is required' });
      }

      const user = req.citizenUser;
      const name = req.body.name || user.name;
      const location = req.body.location || 'Unknown';

      // Pre-AI Validation: Length and Gibberish detection
      const cleanText = text.trim();
      const isTooShort = cleanText.length < 10;
      const isKeyboardSmash = /[^aeiouy\s]{6,}/i.test(cleanText) || /(.)\1{4,}/.test(cleanText);

      if (isTooShort || isKeyboardSmash) {
        console.warn(`[Pre-AI Rejection] Rejected potential nonsense: "${cleanText}" (short=${isTooShort}, smash=${isKeyboardSmash})`);
        return res.status(422).json({
          decision: 'FAKE',
          error: 'invalid description',
          trackingId: `REJ-${uuidv4().slice(0, 8).toUpperCase()}`
        });
      }

      const aiResult = await analyzeComplaint(text, name, location);

      if (aiResult.category === 'Irrelevant') {
        console.warn(`[Complaint Rejection] Irrelevant complaint blocked: "${text}"`);
        return res.status(422).json({
          decision: 'FAKE',
          error: 'invalid description',
          trackingId: `REJ-${uuidv4().slice(0, 8).toUpperCase()}`
        });
      }

      const stage456 = await runStages4567({
        user,
        body: req.body,
        aiResult,
        stage23: req.verificationStage23
      });

      const {
        results456,
        flags,
        finalScore,
        decision,
        textEmb,
        imageEmb,
        bestDuplicate,
        shingles
      } = stage456;

      const gps = parseClientGps(req.body);
      const geoLocation =
        gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng)
          ? { type: 'Point', coordinates: [gps.lng, gps.lat] }
          : undefined;

      const stageResults = {
        stage1: { status: 'PASS', flags: [], contribution: 100 },
        stage2: req.verificationStage23.results.stage2,
        stage3: req.verificationStage23.results.stage3,
        stage4: results456.stage4,
        stage5: results456.stage5,
        stage6: results456.stage6
      };

      const allFlags = [...(req.verificationStage23.flags || []), ...flags];

      const auditEntries = [
        { stage: 1, name: 'firewall', flags: [], partialScore: 100 },
        { stage: 2, name: 'identity_trust', flags: stageResults.stage2.flags, partialScore: stageResults.stage2.contribution },
        { stage: 3, name: 'geo_exif', flags: stageResults.stage3.flags, partialScore: stageResults.stage3.contribution },
        { stage: 4, name: 'ai_content', flags: results456.stage4.flags, partialScore: results456.stage4.contribution },
        { stage: 5, name: 'duplicate', flags: results456.stage5.flags, partialScore: results456.stage5.contribution },
        { stage: 6, name: 'behaviour', flags: results456.stage6.flags, partialScore: results456.stage6.contribution }
      ];

      if (decision === 'DUPLICATE' && bestDuplicate?.id) {
        const existing = await Complaint.findById(bestDuplicate.id).lean();
        const trackingId = existing?.trackingId || 'unknown';
        const dupComplaint = await Complaint.create({
          user: user._id,
          name,
          location,
          complaintText: text,
          category: aiResult.category || 'Other',
          priority: aiResult.priority || 'Medium',
          summary: aiResult.summary || text.substring(0, 100),
          image: req.body.image,
          emailDraft: aiResult.emailDraft,
          trackingId: `DUP-${uuidv4().slice(0, 8)}`,
          verificationScore: finalScore,
          verificationDecision: 'DUPLICATE',
          flags: allFlags,
          fingerprint: req.body.fingerprint,
          exifData: req.exifData,
          geoLocation,
          lat: gps?.lat,
          lng: gps?.lng,
          gpsCapturedAt: gps?.gpsCapturedAt ? new Date(gps.gpsCapturedAt) : undefined,
          ipAddress: req.ip,
          embeddings: { text: textEmb || [], image: imageEmb || [] },
          linkedComplaintId: bestDuplicate.id,
          duplicateSimilarity: bestDuplicate.sim,
          departmentCode: categoryToDept(aiResult.category),
          descriptionShingles: shingles,
          verificationDetails: stageResults,
          status: 'Merged'
        });

        await appendAuditLog({
          complaintId: dupComplaint._id,
          stageResults,
          finalScore,
          decision: 'DUPLICATE',
          entries: auditEntries
        });

        return res.status(200).json({
          merged: true,
          duplicate: true,
          linkedTrackingId: trackingId,
          message: 'This report matches an existing case. You will receive updates on the original tracking ID.',
          trackingId: dupComplaint.trackingId,
          verificationScore: finalScore,
          flags: allFlags
        });
      }

      if (decision === 'RELATED') {
        const trackingId = buildTrackingId(aiResult.category);
        const rel = await Complaint.create({
          user: user._id,
          name,
          location,
          complaintText: text,
          category: aiResult.category || 'Other',
          priority: aiResult.priority || 'Medium',
          summary: aiResult.summary || text.substring(0, 100),
          image: req.body.image,
          emailDraft: aiResult.emailDraft,
          trackingId,
          verificationScore: finalScore,
          verificationDecision: 'RELATED',
          flags: allFlags,
          fingerprint: req.body.fingerprint,
          exifData: req.exifData,
          geoLocation,
          lat: gps?.lat,
          lng: gps?.lng,
          gpsCapturedAt: gps?.gpsCapturedAt ? new Date(gps.gpsCapturedAt) : undefined,
          ipAddress: req.ip,
          embeddings: { text: textEmb || [], image: imageEmb || [] },
          linkedComplaintId: bestDuplicate?.id,
          duplicateSimilarity: bestDuplicate?.sim,
          departmentCode: categoryToDept(aiResult.category),
          descriptionShingles: shingles,
          verificationDetails: stageResults,
          status: 'Related'
        });

        await appendAuditLog({
          complaintId: rel._id,
          stageResults,
          finalScore,
          decision: 'RELATED',
          entries: auditEntries
        });

        if (bestDuplicate?.id) {
          const linked = await Complaint.findById(bestDuplicate.id).lean();
          console.log(`[RELATED] Notify existing case ${linked?.trackingId} about related submission ${rel.trackingId}`);
        }

        return res.status(201).json({
          ...rel.toObject(),
          related: true,
          emailSent: false,
          verificationScore: finalScore,
          flags: allFlags
        });
      }

      if (decision === 'FAKE') {
        const trackingId = `REJ-${uuidv4().slice(0, 12)}`;
        const fake = await Complaint.create({
          user: user._id,
          name,
          location,
          complaintText: text,
          category: aiResult.category || 'Other',
          priority: aiResult.priority || 'Medium',
          summary: aiResult.summary || text.substring(0, 100),
          image: req.body.image,
          emailDraft: aiResult.emailDraft,
          trackingId,
          verificationScore: finalScore,
          verificationDecision: 'FAKE',
          flags: allFlags,
          fingerprint: req.body.fingerprint,
          exifData: req.exifData,
          geoLocation,
          lat: gps?.lat,
          lng: gps?.lng,
          gpsCapturedAt: gps?.gpsCapturedAt ? new Date(gps.gpsCapturedAt) : undefined,
          ipAddress: req.ip,
          embeddings: { text: textEmb || [], image: imageEmb || [] },
          departmentCode: categoryToDept(aiResult.category),
          descriptionShingles: shingles,
          verificationDetails: stageResults,
          status: 'Rejected'
        });

        await appendAuditLog({
          complaintId: fake._id,
          stageResults,
          finalScore,
          decision: 'FAKE',
          entries: auditEntries
        });

        await applyFakeTrustPenalty(user._id);

        return res.status(422).json({
          error: 'Submission did not pass verification.',
          trackingId: fake.trackingId,
          verificationScore: finalScore,
          flags: allFlags,
          decision: 'FAKE'
        });
      }

      const trackingId = buildTrackingId(aiResult.category);
      const complaint = await Complaint.create({
        user: user._id,
        name,
        location,
        complaintText: text,
        category: aiResult.category || 'Other',
        priority: aiResult.priority || 'Medium',
        summary: aiResult.summary || text.substring(0, 100),
        image: req.body.image,
        emailDraft: aiResult.emailDraft,
        trackingId,
        verificationScore: finalScore,
        verificationDecision: decision === 'REAL' ? 'REAL' : 'HUMAN_REVIEW',
        flags: allFlags,
        fingerprint: req.body.fingerprint,
        exifData: req.exifData,
        geoLocation,
        lat: gps?.lat,
        lng: gps?.lng,
        gpsCapturedAt: gps?.gpsCapturedAt ? new Date(gps.gpsCapturedAt) : undefined,
        ipAddress: req.ip,
        embeddings: { text: textEmb || [], image: imageEmb || [] },
        departmentCode: categoryToDept(aiResult.category),
        descriptionShingles: shingles,
        verificationDetails: stageResults,
        status: decision === 'REAL' ? 'Pending' : 'QueuedReview'
      });

      await appendAuditLog({
        complaintId: complaint._id,
        stageResults,
        finalScore,
        decision: complaint.verificationDecision,
        entries: auditEntries
      });

      let emailResult = { success: false };
      if (decision === 'REAL') {
        emailResult = await sendEmailNotification(complaint);
      }

      res.status(201).json({
        ...complaint.toObject(),
        emailSent: emailResult?.success || false,
        recipientEmail: emailResult?.recipient,
        verificationScore: finalScore,
        flags: allFlags,
        decision: complaint.verificationDecision
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
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
                    { $lte: ['$createdAt', sevenDaysAgo] }
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
      .select('trackingId name location complaintText summary category priority status createdAt resolvedAt departmentResponse resolutionImage escalations verificationDecision verificationScore image emailDraft flags');
    res.json(complaints);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: Escalate — raise question to department (complaint > 7 days)
// ═══════════════════════════════════════════════════════════════
router.post('/:id/escalate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Escalation message is required' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    // Check if complaint is older than 7 days
    const ageMs = Date.now() - new Date(complaint.createdAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs < sevenDaysMs) {
      return res.status(400).json({ error: 'Can only escalate complaints older than 7 days' });
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
      .select('trackingId name location complaintText summary category priority status createdAt resolvedAt departmentResponse resolutionImage escalations verificationDecision image emailDraft');
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
