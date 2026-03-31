const config = require('../config/verificationConfig');

function stripControlChars(str) {
  return str.replace(/[\u0000-\u001F\u007F]/g, '');
}

/**
 * Basic injection hardening: strip angle brackets, control chars, trim length.
 */
function sanitizeComplaintText(text) {
  if (typeof text !== 'string') return '';
  let s = stripControlChars(text);
  s = s.replace(/[<>]/g, '');
  if (s.length > config.maxBodyTextLength) {
    s = s.slice(0, config.maxBodyTextLength);
  }
  return s.trim();
}

function sanitizeLocationString(loc) {
  if (typeof loc !== 'string') return '';
  return stripControlChars(loc).replace(/[<>]/g, '').slice(0, 2000).trim();
}

module.exports = { sanitizeComplaintText, sanitizeLocationString, stripControlChars };
