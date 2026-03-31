const User = require('../models/User');

/**
 * After authMiddleware: allow demo admin JWT, role-based admin, or future role claim.
 */
async function adminOnly(req, res, next) {
  // Legacy hardcoded admin check
  if (req.user?.id === 'admin-id-001' || req.user?.isAdmin) {
    return next();
  }
  // Role-based admin check from DB
  try {
    const user = await User.findById(req.user?.id);
    if (user && user.role === 'admin') {
      return next();
    }
  } catch (e) {
    // fall through
  }
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = adminOnly;
