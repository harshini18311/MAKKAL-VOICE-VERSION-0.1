// ============================================================
// IMAGE-TO-COMPLAINT VALIDATION
// Analyzes images for civic issues and text-image alignment
// ============================================================

const civicIssueKeywords = {
  infrastructure: ['road', 'street', 'bridge', 'pothole', 'pavement', 'asphalt', 'sidewalk', 'curb', 'barrier', 'rail'],
  water: ['water', 'leak', 'pipe', 'drainage', 'sewer', 'broken pipe', 'flooding', 'stagnant', 'overflow', 'puddle', 'drain'],
  sanitation: ['garbage', 'trash', 'debris', 'litter', 'waste', 'dump', 'filth', 'dirt', 'rubbish', 'refuse'],
  utilities: ['electricity', 'power', 'power line', 'electric pole', 'cable', 'wire', 'streetlight', 'lamp', 'light'],
  traffic: ['traffic', 'road sign', 'traffic signal', 'crosswalk', 'lane marking', 'congestion', 'accident'],
  public_buildings: ['school', 'hospital', 'clinic', 'police', 'fire', 'community', 'public', 'municipal'],
  safety: ['damaged', 'broken', 'broken glass', 'hazard', 'unsafe', 'danger', 'collapse', 'cracked']
};

// Build comprehensive keyword patterns
const civicKeywordPattern = Object.values(civicIssueKeywords)
  .flat()
  .join('|');

// Generic/suspicious content indicators
const genericPatterns = [
  /^blank$/i,
  /^white$/i,
  /^empty$/i,
  /^no image$/i,
  /^placeholder$/i,
  /^logo$/i,
  /^icon$/i,
  /^design$/i,
  /^illustration$/i,
  /^abstract$/i,
  /^graphic$/i,
  /^render$/i,
  /^wallpaper$/i,
  /^background$/i
];

/**
 * Check if image caption contains civic issue keywords
 */
function hasCivicKeywords(caption) {
  if (!caption) return false;
  const lowerCaption = caption.toLowerCase();
  return new RegExp(`\\b(${civicKeywordPattern})\\b`, 'i').test(lowerCaption);
}

/**
 * Check if caption is generic/irrelevant
 */
function isGenericImage(caption) {
  if (!caption) return true;
  return genericPatterns.some(pattern => pattern.test(caption));
}

/**
 * Check if detected objects match complaint keywords
 */
function matchObjectsToComplaint(detectedObjects, complaintText) {
  if (!detectedObjects || detectedObjects.length === 0) {
    return { matched: 0, total: 0, alignment: 0 };
  }

  const complaintLower = complaintText.toLowerCase();
  const objectLabels = detectedObjects.map(obj => obj.object.toLowerCase());
  
  let matched = 0;
  for (const label of objectLabels) {
    // Check if object appears in complaint text
    if (complaintLower.includes(label)) {
      matched++;
    }
  }

  const alignment = objectLabels.length > 0 ? (matched / objectLabels.length) * 100 : 0;
  
  return {
    matched,
    total: objectLabels.length,
    alignment: Math.round(alignment)
  };
}

/**
 * Score similarity between complaint text and image caption
 * Higher score = better match
 */
function scoreTextImageAlignment(complaintText, imageCaption) {
  if (!complaintText || !imageCaption) return 0;

  const complaintLower = complaintText.toLowerCase();
  const captionLower = imageCaption.toLowerCase();

  // Extract keywords from both
  const complaintWords = complaintLower.split(/\s+/).filter(w => w.length > 3);
  const captionWords = captionLower.split(/\s+/).filter(w => w.length > 3);

  // Count matching words
  const matches = complaintWords.filter(w => captionWords.includes(w)).length;
  const similarity = complaintWords.length > 0 ? (matches / complaintWords.length) * 100 : 0;

  return Math.round(similarity);
}

/**
 * Detect common reused/stock image patterns
 */
function detectStockImagePatterns(caption) {
  const stockPatterns = [
    /stock photo/i,
    /stock image/i,
    /shutterstock/i,
    /getty images/i,
    /istock/i,
    /adobe stock/i,
    /123rf/i,
    /dreamstime/i,
    /vector illustration/i,
    /clip art/i
  ];

  return stockPatterns.some(pattern => pattern.test(caption));
}

/**
 * Main function: Validate image against complaint text
 * @param {string} complaintText - The complaint text
 * @param {string} imageCaption - AI-generated caption of what the image shows
 * @param {Array} detectedObjects - YOLO detected objects [{object: "bus", confidence: 0.95}, ...]
 * @param {string} photoHash - Hash of the photo for duplicate detection
 * @param {boolean} hasExifData - Whether image contains EXIF metadata
 * @returns {Object} Validation result with score and reasoning
 */
async function validateImageComplaint({
  complaintText,
  imageCaption,
  detectedObjects,
  photoHash,
  hasExifData
}) {
  let fraudScore = 0;
  let confidence = 0;
  const reasons = [];

  // PRIMARY: Object detection matching (highest priority)
  if (detectedObjects && detectedObjects.length > 0) {
    const objectMatch = matchObjectsToComplaint(detectedObjects, complaintText);
    
    if (objectMatch.total > 0 && objectMatch.alignment < 20) {
      // Objects detected but don't match complaint (e.g., bus in pothole complaint)
      fraudScore += 70; // VERY HIGH PENALTY for clear mismatch
      confidence = 98;
      const detectedLabels = detectedObjects.map(o => o.object).join(", ");
      reasons.push(`Object detection mismatch: Found [${detectedLabels}] but complaint mentions different issue (${objectMatch.alignment}% match)`);
    } else if (objectMatch.total > 0 && objectMatch.alignment >= 70) {
      // Strong object match - reduce suspicion
      return {
        isFraud: false,
        fraudScore: 0,
        confidence: 100,
        reason: `Objects match complaint: [${detectedObjects.map(o => o.object).join(", ")}]`,
        alignmentScore: objectMatch.alignment
      };
    }
  }

  // RULE 1: Check if image is blank/generic
  if (isGenericImage(imageCaption)) {
    fraudScore += 55;
    confidence = 98;
    reasons.push('Image is generic, blank, or not a real civic issue photograph');
  }

  // RULE 2: Check for stock/clipart indicators
  if (detectStockImagePatterns(imageCaption)) {
    fraudScore += 50;
    confidence = 95;
    reasons.push('Image appears to be stock photo or illustration, not authentic');
  }

  // RULE 3: Check civic issue relevance
  const hasCivic = hasCivicKeywords(imageCaption);
  if (!hasCivic) {
    fraudScore += 45;
    confidence = 92;
    reasons.push('Image does not show recognized civic infrastructure or issues');
  }

  // RULE 4: Check text-image alignment (caption)
  const alignmentScore = scoreTextImageAlignment(complaintText, imageCaption);
  if (alignmentScore < 25 && hasCivic) {
    fraudScore += 35;
    confidence = 85;
    reasons.push(`Low alignment between complaint and image content (${alignmentScore}% match)`);
  }

  // RULE 5: Check EXIF data presence
  if (!hasExifData && fraudScore > 15) {
    fraudScore += 25;
    confidence = Math.min(confidence + 8, 100);
    reasons.push('No EXIF metadata - image may not be authentic smartphone/camera photo');
  }

  // SUCCESS: Likely legitimate
  if (fraudScore === 0) {
    return {
      isFraud: false,
      fraudScore: 0,
      confidence: 100,
      reason: 'Image appears to show real civic issue matching complaint text',
      alignmentScore
    };
  }

  return {
    isFraud: fraudScore >= 40,
    fraudScore: Math.min(fraudScore, 100),
    confidence: Math.min(confidence, 100),
    reason: reasons.join('; '),
    alignmentScore: alignmentScore || 0
  };
}

module.exports = {
  validateImageComplaint,
  scoreTextImageAlignment,
  matchObjectsToComplaint,
  hasCivicKeywords,
  isGenericImage,
  detectStockImagePatterns
};
