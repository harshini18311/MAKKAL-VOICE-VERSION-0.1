const User = require('../models/User');

/**
 * Allow only department-role users. Attaches req.departmentUser with full user doc.
 */
async function departmentOnly(req, res, next) {
  try {
    const user = await User.findById(req.user?.id);
    if (!user || user.role !== 'department') {
      return res.status(403).json({ error: 'Department access required' });
    }
    req.departmentUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error checking department access' });
  }
}

module.exports = departmentOnly;
