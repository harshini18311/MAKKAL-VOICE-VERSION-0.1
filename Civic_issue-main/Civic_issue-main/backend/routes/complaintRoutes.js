const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const Complaint = require('../models/Complaint');
const { analyzeComplaint } = require('../../ai-services/aiService');
const { transcribeAudio } = require('../../ai-services/speechService');
const { sendEmailNotification } = require('../../ai-services/emailService');
const { detectComplaintFraud } = require('../utils/fraudDetection');
const { inspectComplaintPhoto } = require('../utils/imageForensics');
const { validateImageComplaint } = require('../utils/imageComplaintValidator');
const { getHfFraudScore } = require('../utils/huggingFraudService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.post('/', authMiddleware, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
  const audioFile = req.files?.audio?.[0] || null;
  const photoFile = req.files?.photo?.[0] || null;
  console.log('Incoming Complaint Submission:', { body: req.body, audio: !!audioFile, photo: !!photoFile, user: req.user.id });
  try {
    const normalizedUserId = mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null;

    // Hard burst limiting for abuse prevention.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const rateLimitFilter = normalizedUserId
      ? { user: normalizedUserId, createdAt: { $gte: tenMinutesAgo } }
      : { sourceIp: req.ip, createdAt: { $gte: tenMinutesAgo } };
    const recentCount = await Complaint.countDocuments(rateLimitFilter);

    if (recentCount >= 5) {
      return res.status(429).json({
        error: 'Too many complaints submitted in a short time. Please try again later.'
      });
    }

    let text = req.body.text;
    
    if (audioFile) {
      // Audio provided
      text = await transcribeAudio(audioFile.buffer);
    }
    
    if (!text) {
      return res.status(400).json({ error: 'Either text or audio is required' });
    }

    // Agentic AI Phase: Analyze text
    const name = req.body.name || req.user.name;
    const location = req.body.location || 'Unknown';
    const aiResult = await analyzeComplaint(text, name, location);

    // Fetch recent complaints for HF semantic similarity check
    const recentComplaints = await Complaint.find({
      createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('complaintText textEmbedding trackingId');

    // Run STRICT 7-FACTOR fraud detection (primary) and HF for additional confidence
    const [ruleResult, hfResult] = await Promise.all([
      detectComplaintFraud({
        Complaint,
        userId: normalizedUserId,
        text,
        location,
        sourceIp: req.ip
      }),
      getHfFraudScore(text, recentComplaints)
    ]);

    // Use 7-factor analysis as primary (already includes behavioral checks)
    // HF adds auxiliary confidence boost if both agree
    let finalScore = ruleResult.fraudScore;
    
    // If HF also flags it, increase confidence slightly (but don't over-escalate)
    if (hfResult.score > 30 && ruleResult.fraudScore > 20) {
      finalScore = Math.min(ruleResult.fraudScore + 5, 100);
    }
    
    // Collect all reasons
    let mergedReasons = [...ruleResult.fraudReasons];
    if (hfResult.reasons && hfResult.reasons.length > 0) {
      mergedReasons = [...mergedReasons, ...hfResult.reasons];
    }

    // Embedding from HF for storage
    let textEmbedding = hfResult.embedding || null;

    let photoHash;
    let photoCapturedAt;
    let photoGeo;

    if (photoFile) {
      const photoResult = await inspectComplaintPhoto(photoFile.buffer);

      if (!photoResult.ok) {
        finalScore = Math.min(finalScore + 15, 100);
        mergedReasons.push('[RULE] Photo forensics unavailable: verify image manually');
      } else {
        photoHash = photoResult.hash;
        photoCapturedAt = photoResult.capturedAt || null;
        photoGeo = photoResult.gps || null;

        // IMAGE-TO-COMPLAINT VALIDATION: Always run, even without caption
        const imageCaption = photoResult.caption || 'Image analysis unavailable';
        const hasExifMetadata = !(photoResult.warnings && photoResult.warnings.length > 1);
        const detectedObjects = photoResult.detectedObjects || [];  // NEW: From YOLO
        
        // If no caption could be generated, mark as suspicious (no evidence of real civic issue)
        if (!photoResult.caption) {
          finalScore = Math.min(finalScore + 35, 100);
          mergedReasons.push('[IMAGE] No caption generated - image validation inconclusive');
        }
        
        const imageValidation = await validateImageComplaint({
          complaintText: text,
          imageCaption: imageCaption,
          detectedObjects: detectedObjects,  // NEW: Pass detected objects
          photoHash: photoHash,
          hasExifData: hasExifMetadata
        });

        if (imageValidation.isFraud) {
          finalScore = Math.min(finalScore + imageValidation.fraudScore, 100);
          mergedReasons.push(`[IMAGE] ${imageValidation.reason} (confidence: ${imageValidation.confidence}%)`);
        } else if (imageValidation.fraudScore === 0) {
          // Legitimate image - slight boost
          mergedReasons.push(`[IMAGE] Image validated: real civic issue detected`);
        }

        if (Array.isArray(photoResult.warnings) && photoResult.warnings.length > 0) {
          finalScore = Math.min(finalScore + 15, 100);
          for (const warning of photoResult.warnings) {
            mergedReasons.push(`[PHOTO] ${warning}`);
          }
        }

        if (photoHash) {
          const existingWithSameHash = await Complaint.findOne({
            photoHash,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }).select('_id trackingId createdAt');

          if (existingWithSameHash) {
            finalScore = Math.min(finalScore + 35, 100);
            mergedReasons.push('[RULE] Duplicate photo detected from previous complaint');
          }
        }
      }
    }

    // Apply STRICT fraud status thresholds (reduced to catch more fraud)
    // CLEAN: 0-19, SUSPICIOUS: 20-39, FLAGGED: 40-100
    let fraudStatus = 'Clean';
    if (finalScore >= 40) {
      fraudStatus = 'Flagged';
    } else if (finalScore >= 20) {
      fraudStatus = 'Suspicious';
    }

    // Save to Database
    const trackingId = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
    const complaintData = {
      user: normalizedUserId,
      name,
      location,
      complaintText: text,
      category: aiResult.category || 'Other',
      priority: aiResult.priority || 'Medium',
      summary: aiResult.summary || text.substring(0, 100),
      emailDraft: aiResult.emailDraft,
      photoHash,
      photoCapturedAt,
      photoGeo,
      trackingId,
      fraudScore: finalScore,
      fraudStatus,
      fraudReasons: mergedReasons,
      sourceIp: req.ip
    };

    // Store embedding if available (for future similarity checks)
    if (textEmbedding && Array.isArray(textEmbedding) && textEmbedding.length > 0) {
      complaintData.textEmbedding = textEmbedding;
    }

    const complaint = await Complaint.create(complaintData);

    // Automate Email Notification
    await sendEmailNotification(complaint);

    res.status(201).json(complaint);
  } catch (error) {
    console.error('Complaint processing error:', error);
    res.status(500).json({ error: 'Failed to process complaint' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    // Optionally filter by user if not admin. For demo, returning all configs if no filters requested.
    const complaints = await Complaint.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Not found' });
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
