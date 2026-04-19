// ============================================================
// SIMPLIFIED FRAUD DETECTION
// Direct rule-based scoring for high accuracy
// ============================================================

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * STRICT GIBBERISH DETECTION - Restore and make aggressive
 * Detects repeated nonsense, low vowel ratios, inadequate meaningful content
 */
function isGibberish(text) {
  const words = text.split(" ").filter(w => w.length > 0);
  if (words.length === 0) return true;
  
  let validWords = 0;

  // A valid word must have:
  // 1. Length > 2
  // 2. At least 20% vowels (more lenient than 25% to catch more gibberish)
  for (let w of words) {
    if (w.length > 2) {
      const vowelCount = (w.match(/[aeiou]/gi) || []).length;
      const vowelRatio = vowelCount / w.length;
      if (vowelRatio >= 0.20) {
        validWords++;
      }
    }
  }

  return validWords / words.length < 0.5;  // Less than 50% valid words = gibberish
}

/**
 * DETECT MEANINGLESS/VAGUE TEXT
 * Catch spam using single word, repeated same word, or generic placeholders
 */
function isMeaninglessText(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  // Single word complaint
  if (words.length === 1) return true;
  
  // Two identical/similar words repeated
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) return true;
  
  // All caps spam pattern (e.g., "AAAAA" or "XXXXX")
  if (/^[A-Z]{3,}$/.test(text)) return true;
  
  // Only numbers/special chars (no letters)
  if (!/[a-z]/i.test(text) && text.length > 0) return true;
  
  // Looks like placeholder/filler (e.g., "asdf", "jjjj", "test", "demo")
  const placeholders = /^(asdf|qwerty|test|demo|x+|z+|aaa+|zzz+|help|hello|hi|ok|yes|no)$/i;
  if (placeholders.test(text.trim())) return true;
  
  return false;
}

async function detectComplaintFraud({ Complaint, userId, text, location, sourceIp }) {
  const rawText = (text || '').trim();
  const cleanedText = normalizeText(rawText);
  const allReasons = [];
  let fraudScore = 0;

  // PRIMARY CHECK: Gibberish detection - AGGRESSIVE SCORING
  const gibberishFlag = isGibberish(rawText);
  if (gibberishFlag) {
    fraudScore += 60; // HIGH SCORE - ensures flagging
    allReasons.push('Gibberish content - insufficient valid words with proper vowel patterns');
  }

  // RULE 0: Meaningless/Vague text - catches spam early
  const meaningless = isMeaninglessText(rawText);
  if (meaningless) {
    fraudScore += 55;
    allReasons.push('Text appears meaningless, generic, or placeholder content');
  }

  // RULE 1: Text length < 15 characters - INCREASED PENALTY
  if (cleanedText.length < 15) {
    fraudScore += 45; // UP from 30
    allReasons.push('Text critically short (< 15 characters)');
  }

  // RULE 2: Repeated words pattern - INCREASED PENALTY
  if (/(\b\w+\b)(\s+\1){2,}/i.test(rawText)) {
    fraudScore += 70; // UP from 50
    allReasons.push('Direct word repetition detected (pattern: word word word)');
  }

  // RULE 3: Less than 4 words - INCREASED PENALTY
  if (rawText.split(/\s+/).filter(w => w.length > 0).length < 4) {
    fraudScore += 40; // UP from 20
    allReasons.push('Insufficient word count (< 4 words)');
  }

  // RULE 4: No recognizable civic issue keywords - INCREASED PENALTY
  const civicKeywords = /\b(road|street|water|electricity|power|garbage|trash|traffic|bridge|school|hospital|repair|fix|broken|damaged|issue|problem|pothole|leak|pipe|drainage|complaint|urgent|help|emergency|public|municipal|city|civic)\b/i;
  if (!civicKeywords.test(rawText)) {
    fraudScore += 40; // UP from 25
    allReasons.push('No civic issue keywords or complaint language found');
  }

  // RULE 5: No location mentioned - INCREASED PENALTY
  if (!location || location.trim().length < 2) {
    fraudScore += 30; // UP from 15
    allReasons.push('No location information provided');
  }

  // BEHAVIORAL CHECK 1: Multiple submissions in 24h
  if (Complaint && userId) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userRecentCount = await Complaint.countDocuments({
      user: userId,
      createdAt: { $gte: oneDayAgo }
    });

    if (userRecentCount >= 5) {
      fraudScore += 30;
      allReasons.push('Multiple submissions in 24 hours (5+)');
    }
  }

  // BEHAVIORAL CHECK 2: Bulk submissions from same IP
  if (Complaint && sourceIp) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ipRecentCount = await Complaint.countDocuments({
      sourceIp,
      createdAt: { $gte: oneDayAgo }
    });

    if (ipRecentCount >= 8) {
      fraudScore += 20;
      allReasons.push('Bulk submissions from same IP (8+)');
    }
  }

  // BEHAVIORAL CHECK 3: Exact duplicate
  if (Complaint && cleanedText && userId) {
    const escaped = escapeRegex(rawText.trim());
    const exactDuplicate = await Complaint.findOne({
      user: userId,
      complaintText: { $regex: `^${escaped}$`, $options: 'i' },
      createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
    }).select('_id');

    if (exactDuplicate) {
      fraudScore = 100;
      allReasons.push('Exact duplicate complaint detected');
    }
  }

  // Cap score at 100
  fraudScore = Math.min(fraudScore, 100);

  // Determine category
  let category = 'real';
  if (gibberishFlag || /gibberish/i.test(allReasons.join(','))) {
    category = 'gibberish';
  }
  if (allReasons.some(r => r.includes('keyword'))) {
    category = 'spam';
  }
  if (fraudScore === 100) {
    category = 'duplicate';
  }

  // Determine fraud status (THRESHOLDS)
  let fraudStatus = 'Clean';
  if (fraudScore >= 40) {
    fraudStatus = 'Flagged';
  } else if (fraudScore >= 20) {
    fraudStatus = 'Suspicious';
  }

  return {
    isFraud: fraudScore >= 20,
    confidence: Math.min(fraudScore, 100),
    fraudScore: fraudScore,
    reason: allReasons.slice(0, 3).join('; '),
    category,
    severity: fraudScore >= 40 ? 'high' : fraudScore >= 20 ? 'medium' : 'low',
    fraudStatus,
    fraudReasons: allReasons
  };
}

module.exports = { detectComplaintFraud, isGibberish, isMeaninglessText };
