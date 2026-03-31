const rateLimit = require('express-rate-limit');

const complaintIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again later.' }
});

const deviceHits = new Map();

function checkDeviceWindow(fingerprint) {
  const key = fingerprint && String(fingerprint).slice(0, 128) || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 40;
  let entry = deviceHits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  entry.count += 1;
  deviceHits.set(key, entry);
  if (entry.count > max) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  return { ok: true };
}

function complaintDeviceLimiter(req, res, next) {
  const fp = req.body?.fingerprint || req.headers['x-device-id'];
  const r = checkDeviceWindow(fp);
  if (!r.ok) {
    return res.status(429).json({
      error: 'Too many submissions from this device. Please try again later.',
      retryAfterMs: Math.max(0, r.retryAfterMs || 0)
    });
  }
  next();
}

module.exports = { complaintIpLimiter, complaintDeviceLimiter, checkDeviceWindow };
