const axios = require('axios');
const { sanitizeComplaintText, sanitizeLocationString } = require('../utils/sanitizeInput');

async function verifyRecaptchaIfConfigured(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'captcha_required' };
  }
  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000
    });
    if (data.success) {
      const score = typeof data.score === 'number' ? data.score : 1;
      if (score < 0.3) return { ok: false, reason: 'captcha_low_score' };
      return { ok: true, score };
    }
    return { ok: false, reason: 'captcha_failed' };
  } catch (e) {
    console.warn('reCAPTCHA verify error:', e.message);
    return { ok: true, skipped: true, error: e.message };
  }
}

async function firewallSanitizeMiddleware(req, res, next) {
  try {
    const captcha = await verifyRecaptchaIfConfigured(req.body?.captchaToken);
    if (!captcha.ok) {
      return res.status(403).json({ error: 'Bot verification failed. Please refresh and try again.' });
    }
    req.captchaResult = captcha;

    if (req.body.text != null) {
      req.body.text = sanitizeComplaintText(String(req.body.text));
    }
    if (req.body.complaintText != null) {
      req.body.complaintText = sanitizeComplaintText(String(req.body.complaintText));
    }
    if (req.body.location != null) {
      req.body.location = sanitizeLocationString(String(req.body.location));
    }
    if (req.body.name != null) {
      req.body.name = sanitizeLocationString(String(req.body.name));
    }

    next();
  } catch (e) {
    console.error('firewallSanitize:', e);
    res.status(500).json({ error: 'Firewall failed' });
  }
}

module.exports = { firewallSanitizeMiddleware, verifyRecaptchaIfConfigured };
