const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.log('AUTH ERROR: No token provided');
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    req.user = decoded;
    next();
  } catch (err) {
    console.log('AUTH ERROR: Token verification failed:', err.message);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
