const mongoose = require('mongoose');

/**
 * Complaint submission requires a real Mongo user id (not admin JWT).
 */
function citizenOnly(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.user?.id)) {
    return res.status(403).json({ error: 'Citizen account required to submit complaints.' });
  }
  next();
}

module.exports = citizenOnly;
