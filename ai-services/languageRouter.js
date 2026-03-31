/**
 * DTMF → BCP-47 language routing
 * Single source of truth for Whisper, Google TTS, and SMS templates.
 */

const LANGUAGE_MAP = {
  '1': { bcp47: 'ta-IN', name: 'Tamil',      whisperCode: 'ta', ttsVoice: 'ta-IN-Standard-A', smsGreeting: 'வணக்கம்' },
  '2': { bcp47: 'hi-IN', name: 'Hindi',      whisperCode: 'hi', ttsVoice: 'hi-IN-Standard-A', smsGreeting: 'नमस्ते' },
  '3': { bcp47: 'en-IN', name: 'English',    whisperCode: 'en', ttsVoice: 'en-IN-Standard-A', smsGreeting: 'Hello' },
  '4': { bcp47: 'te-IN', name: 'Telugu',     whisperCode: 'te', ttsVoice: 'te-IN-Standard-A', smsGreeting: 'నమస్కారం' },
  '5': { bcp47: 'kn-IN', name: 'Kannada',    whisperCode: 'kn', ttsVoice: 'kn-IN-Standard-A', smsGreeting: 'ನಮಸ್ಕಾರ' },
  '6': { bcp47: 'ml-IN', name: 'Malayalam',  whisperCode: 'ml', ttsVoice: 'ml-IN-Standard-A', smsGreeting: 'നമസ്കാരം' },
  '7': { bcp47: 'bn-IN', name: 'Bengali',    whisperCode: 'bn', ttsVoice: 'bn-IN-Standard-A', smsGreeting: 'নমস্কার' },
  '8': { bcp47: 'mr-IN', name: 'Marathi',    whisperCode: 'mr', ttsVoice: 'mr-IN-Standard-A', smsGreeting: 'नमस्कार' },
  '9': { bcp47: 'gu-IN', name: 'Gujarati',   whisperCode: 'gu', ttsVoice: 'gu-IN-Standard-A', smsGreeting: 'નમસ્તે' },
  '0': { bcp47: 'pa-IN', name: 'Punjabi',    whisperCode: 'pa', ttsVoice: 'pa-IN-Standard-A', smsGreeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ' }
};

const DEFAULT_LANGUAGE = LANGUAGE_MAP['3']; // English fallback

/**
 * Get language config from a DTMF digit.
 * @param {string|number} digit — DTMF key pressed (0–9)
 * @returns {{ bcp47: string, name: string, whisperCode: string, ttsVoice: string, smsGreeting: string }}
 */
function getLanguageFromDTMF(digit) {
  return LANGUAGE_MAP[String(digit)] || DEFAULT_LANGUAGE;
}

/**
 * Get all supported languages for TTS prompt generation.
 * @returns {Array<{ digit: string, bcp47: string, name: string }>}
 */
function getAllLanguages() {
  return Object.entries(LANGUAGE_MAP).map(([digit, lang]) => ({
    digit,
    bcp47: lang.bcp47,
    name: lang.name
  }));
}

/**
 * Build TTS prompt listing all language options for IVR.
 */
function buildLanguageMenuPrompt() {
  const lines = Object.entries(LANGUAGE_MAP).map(
    ([digit, lang]) => `Press ${digit} for ${lang.name}`
  );
  return `Please select your language. ${lines.join('. ')}.`;
}

module.exports = {
  getLanguageFromDTMF,
  getAllLanguages,
  buildLanguageMenuPrompt,
  LANGUAGE_MAP,
  DEFAULT_LANGUAGE
};
