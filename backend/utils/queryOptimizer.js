/**
 * queryOptimizer.js
 * MAKKAL VOICE — Visual Query Optimization for Zero-Shot Multi-Modal AI
 * Removes "conversational noise" and conversational constructs from complaint text
 * turning descriptions into precise "visual targets" for CLIP-like models.
 */

const NOISE_WORDS = new Set([
  'please', 'help', 'urgent', 'urgently', 'sir', 'madam', 'complaint', 'complaining',
  'request', 'requesting', 'fixed', 'fix', 'solve', 'solved', 'issue', 'problem',
  'immediately', 'asap', 'soon', 'possible', 'authorities', 'government',
  'makkal', 'voice', 'near', 'my', 'house', 'our', 'area', 'street', 'hello',
  'hi', 'dear', 'respected', 'kindly', 'look', 'into', 'this', 'matter',
  'years', 'months', 'days', 'long', 'time', 'since', 'nobody', 'cared',
  'action', 'take'
]);

/**
 * Extracts the core visual subject from a noisy complaint description.
 * @param {string} text Raw user complaint e.g., "Please fix the massive pothole near my house ASAP it is very dangerous"
 * @returns {string} Clean visual phrase e.g., "massive pothole dangerous"
 */
function optimizeVisualQuery(text) {
  if (!text) return '';
  
  // 1. Lowercase and remove punctuation except hyphens
  let normalized = text.toLowerCase().replace(/[^\w\s-]/g, ' ');

  // 2. Split into tokens
  let tokens = normalized.split(/\s+/).filter(t => t.length > 0);

  // 3. Remove conversational noise
  let visualTokens = tokens.filter(t => !NOISE_WORDS.has(t));

  // 4. Reconstruct, fallback to original if we stripped everything
  let optimized = visualTokens.join(' ');
  
  if (optimized.trim().length === 0) {
    optimized = text.substring(0, 50).trim(); // fallback
  }

  return optimized;
}

module.exports = {
  optimizeVisualQuery
};
