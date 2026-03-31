const User = require('../models/User');
const Complaint = require('../models/Complaint');
const { runStages2and3 } = require('../services/verificationRunner');

async function earlyVerificationMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const lastComplaint = await Complaint.findOne({ user: user._id }).sort({ createdAt: -1 });
    if (lastComplaint && Date.now() - lastComplaint.createdAt.getTime() < 60000) {
      return res.status(429).json({ error: 'Please wait 60 seconds between submissions.' });
    }

    if (user.submissionBannedUntil && user.submissionBannedUntil > new Date()) {
      return res.status(403).json({ error: 'Submission temporarily suspended. Contact support.' });
    }

    const stage23 = await runStages2and3(req, user);
    req.verificationStage23 = stage23;
    req.citizenUser = await User.findById(req.user.id);
    next();
  } catch (err) {
    console.error('earlyVerification:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

module.exports = earlyVerificationMiddleware;
