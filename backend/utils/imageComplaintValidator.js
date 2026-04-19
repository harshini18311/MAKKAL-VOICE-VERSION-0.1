// ============================================================
// MAKKAL VOICE — Patent-Grade Image-Complaint Semantic Engine
// ============================================================
// Multi-layer alignment scoring:
//   Layer 1  (50%) — YOLO object → civic domain ontology match
//   Layer 2  (20%) — Visual fingerprint (color, entropy, texture)
//   Layer 3  (30%) — Complaint text → expected visual domain
// ============================================================

// ─────────────────────────────────────────────────────────────
// CIVIC DOMAIN ONTOLOGY
// 15 categories × 300+ keywords
// ─────────────────────────────────────────────────────────────
const CIVIC_ONTOLOGY = {
  road: {
    keywords: [
      'pothole', 'road', 'street', 'asphalt', 'pavement', 'crack', 'highway',
      'lane', 'bridge', 'tar', 'broken road', 'damaged road', 'speed breaker',
      'divider', 'median', 'shoulder', 'berm', 'culvert', 'bitumen', 'tarmac',
      'road damage', 'road repair', 'rough road', 'bumpy', 'uneven road',
      'road hole', 'road excavation', 'road dug up', 'crater', 'road cave-in',
      'road collapse', 'road wash out', 'road erosion', 'potholes', 'pothole fills',
      'road sign', 'km post', 'milestone', 'road marking', 'lane marking'
    ],
    yoloClasses: ['car', 'truck', 'bus', 'motorcycle', 'traffic light', 'stop sign', 'train'],
    visualColors: ['grey', 'black', 'brown', 'beige', 'mixed'],
    weight: 1.0
  },

  water: {
    keywords: [
      'water', 'leak', 'pipe', 'drain', 'drainage', 'sewer', 'flooding',
      'waterlogging', 'stagnant', 'overflow', 'puddle', 'pond', 'blocked drain',
      'broken pipe', 'leaking', 'burst pipe', 'water supply', 'borewell',
      'groundwater', 'contaminated water', 'drinking water', 'water line',
      'water main', 'pipeline', 'water connection', 'tap water', 'water meter',
      'water board', 'sewage', 'effluent', 'wastewater', 'runoff',
      'manhole', 'open manhole', 'flooded', 'inundated', 'submerged',
      'water pump', 'water tank', 'reservoir', 'canal', 'stream',
      'river', 'nullah', 'waterway', 'culvert overflow'
    ],
    yoloClasses: ['sink', 'toilet', 'fire hydrant', 'bottle', 'boat'],
    visualColors: ['blue', 'dark blue', 'brown', 'dark green', 'grey'],
    weight: 1.0
  },

  sanitation: {
    keywords: [
      'garbage', 'trash', 'waste', 'dump', 'filth', 'dirt', 'rubbish',
      'littering', 'litter', 'refuse', 'stench', 'smell', 'bin', 'dustbin',
      'sewage', 'open defecation', 'faecal', 'hygiene', 'rats', 'cockroach',
      'mosquito', 'breeding', 'compost', 'dumping', 'slum', 'solid waste',
      'municipal solid waste', 'msw', 'garbage pile', 'garbage dump',
      'uncollected garbage', 'overflowing bin', 'public toilet', 'latrine',
      'swachh', 'cleanliness', 'sanitation worker', 'safai karamchari',
      'burning garbage', 'illegal dumping', 'construction debris',
      'waste pile', 'waste management', 'waste collection', 'rag picker',
      'plastic waste', 'bio-medical waste', 'e-waste', 'hazardous waste'
    ],
    yoloClasses: ['bottle', 'cup', 'couch', 'dog', 'bird'],
    visualColors: ['brown', 'dark grey', 'black', 'dark green', 'mixed'],
    weight: 1.0
  },

  electricity: {
    keywords: [
      'electricity', 'power', 'power cut', 'blackout', 'outage', 'voltage',
      'electric pole', 'transformer', 'wire', 'cable', 'streetlight',
      'light', 'lamp', 'spark', 'short circuit', 'shock', 'meter', 'billing',
      'power supply', 'no power', 'tripping', 'fluctuation', 'burnt pole',
      'leaning pole', 'broken pole', 'dangling wire', 'live wire',
      'exposed wire', 'high voltage', 'substation', 'feeder', 'line fault',
      'electric bill', 'current', 'fuse', 'circuit breaker', 'capacitor',
      'load shedding', 'power interruption', 'supply failure',
      'unsafe wiring', 'death due to electricity', 'electrocution'
    ],
    yoloClasses: [],
    visualColors: ['grey', 'black', 'white', 'silver'],
    weight: 0.9
  },

  traffic: {
    keywords: [
      'traffic', 'congestion', 'jam', 'signal', 'accident', 'vehicle',
      'road block', 'diversion', 'wrong side', 'overloading', 'no parking',
      'encroachment', 'zebra crossing', 'speed', 'reckless', 'drunk driving',
      'hit and run', 'unsafe', 'pile up', 'collision', 'pedestrian',
      'footpath', 'footpath encroachment', 'two-wheeler', 'auto',
      'auto-rickshaw', 'cab', 'taxi', 'lorry', 'speeding', 'signal jump',
      'helmet', 'seat belt', 'speed breaker', 'road rage', 'road accident',
      'traffic sign', 'road sign', 'road marking', 'lane discipline',
      'roundabout', 'junction', 'intersection', 'one-way', 'flyover'
    ],
    yoloClasses: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'traffic light', 'stop sign', 'train'],
    visualColors: ['grey', 'black', 'yellow', 'white', 'mixed'],
    weight: 1.0
  },

  public_buildings: {
    keywords: [
      'school', 'hospital', 'clinic', 'dispensary', 'government', 'office',
      'ration shop', 'panchayat', 'court', 'police', 'fire station',
      'community hall', 'library', 'anganwadi', 'building', 'structure',
      'wall', 'ceiling', 'roof', 'crumbling', 'dilapidated', 'demolish',
      'public property', 'government property', 'municipal', 'taluk',
      'collectorate', 'sub-registrar', 'khatha', 'patta', 'bhawan',
      'government school', 'primary school', 'secondary school',
      'public hospital', 'chc', 'phc', 'sub centre', 'anm', 'asha',
      'balwadi', 'noon meal', 'mid-day meal', 'smart city', 'heritage'
    ],
    yoloClasses: ['person', 'bench', 'chair'],
    visualColors: ['beige', 'white', 'grey', 'red', 'mixed'],
    weight: 0.8
  },

  safety: {
    keywords: [
      'danger', 'hazard', 'unsafe', 'risk', 'collapse', 'broken', 'fallen',
      'accident', 'injury', 'fire', 'explosion', 'chemical', 'toxic',
      'open manhole', 'exposed wire', 'falling debris', 'tree fallen',
      'flood', 'landslide', 'encroachment', 'illegal construction',
      'fire accident', 'boiler explosion', 'gas leak', 'lpg leak',
      'cylinders', 'inflammable', 'lockdown violation', 'crowd',
      'stampede', 'stone pelting', 'arson', 'vandalism', 'graffiti',
      'public nuisance', 'noise pollution', 'blasting', 'quarrying'
    ],
    yoloClasses: ['knife', 'baseball bat'],
    visualColors: ['red', 'orange', 'yellow', 'black', 'mixed'],
    weight: 0.9
  }
};

// All civic keywords flat list for quick lookup
const ALL_CIVIC_KEYWORDS = Object.values(CIVIC_ONTOLOGY)
  .flatMap(cat => cat.keywords);

// ─────────────────────────────────────────────────────────────
// YOLO CLASS → CIVIC CATEGORY WEIGHTS
// ─────────────────────────────────────────────────────────────
const YOLO_TO_CIVIC_WEIGHTS = {};
for (const [catName, catData] of Object.entries(CIVIC_ONTOLOGY)) {
  for (const cls of catData.yoloClasses) {
    if (!YOLO_TO_CIVIC_WEIGHTS[cls]) YOLO_TO_CIVIC_WEIGHTS[cls] = {};
    YOLO_TO_CIVIC_WEIGHTS[cls][catName] = (YOLO_TO_CIVIC_WEIGHTS[cls][catName] || 0) + catData.weight;
  }
}

// ─────────────────────────────────────────────────────────────
// LAYER 3 — Identify complaint categories from text
// ─────────────────────────────────────────────────────────────
function identifyComplaintCategories(complaintText) {
  if (!complaintText) return [];
  const text = complaintText.toLowerCase();
  const scores = {};

  for (const [catName, catData] of Object.entries(CIVIC_ONTOLOGY)) {
    const hits = catData.keywords.filter(kw => text.includes(kw)).length;
    if (hits > 0) scores[catName] = hits;
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);
}

// ─────────────────────────────────────────────────────────────
// LAYER 1 — YOLO Objects → Civic Domain Score (0–100)
// ─────────────────────────────────────────────────────────────
function scoreYoloAlignment(detectedObjects, categories) {
  if (!detectedObjects || detectedObjects.length === 0 || categories.length === 0) {
    return null; // null means "no YOLO data available"
  }

  let totalConf = 0;
  let matchedWeight = 0;

  for (const obj of detectedObjects) {
    const label = obj.object.toLowerCase();
    const conf  = obj.confidence || 0.5;
    const civicMap = YOLO_TO_CIVIC_WEIGHTS[label] || {};

    for (const cat of categories) {
      matchedWeight += (civicMap[cat] || 0) * conf;
    }
    totalConf += conf;
  }

  if (totalConf === 0) return 0;

  // Normalize: max possible would be if every object perfectly matched every category
  const raw = (matchedWeight / totalConf) * 100;
  return Math.min(Math.round(raw), 100);
}

// ─────────────────────────────────────────────────────────────
// LAYER 1b — Explicit YOLO vs Category "expected classes" check
// This is a secondary boost check
// ─────────────────────────────────────────────────────────────
function scoreExpectedYoloClasses(detectedObjects, categories) {
  if (!detectedObjects || detectedObjects.length === 0) return 0;

  const detectedLabels = new Set(detectedObjects.map(o => o.object.toLowerCase()));
  let totalExpected = 0;
  let foundExpected = 0;

  for (const cat of categories) {
    const expected = CIVIC_ONTOLOGY[cat]?.yoloClasses || [];
    totalExpected += expected.length;
    foundExpected += expected.filter(cls => detectedLabels.has(cls)).length;
  }

  if (totalExpected === 0) return 50; // no expected = neutral
  return Math.round((foundExpected / totalExpected) * 100);
}

// ─────────────────────────────────────────────────────────────
// LAYER 2 — Visual Signature → Category Color Match (0–100)
// ─────────────────────────────────────────────────────────────
function scoreVisualSignature(visualSignature, categories) {
  if (!visualSignature || Object.keys(visualSignature).length === 0) {
    return null; // no visual data
  }

  const { dominant_color, pixel_entropy, edge_density, color_variance, is_likely_digital } = visualSignature;

  // Hard reject: digital-looking image (poster, clipart, screenshot)
  if (is_likely_digital === true) {
    return 0;
  }

  // ── Color match vs expected civic visual range ──
  let colorHits = 0;
  for (const cat of categories) {
    const expectedColors = CIVIC_ONTOLOGY[cat]?.visualColors || [];
    if (expectedColors.includes(dominant_color)) colorHits++;
  }
  const colorScore = categories.length > 0
    ? (colorHits / categories.length) * 50
    : 25;

  // ── Real photo authenticity bonus ──
  // Real outdoor photos have more color variance and edge density than digital art
  // Start from a neutral 30 and add bonuses based on signals
  let realPhotoBonus = 30;
  if (color_variance != null && color_variance > 20) realPhotoBonus += 15;  // textured scene
  if (edge_density != null && edge_density > 0.05) realPhotoBonus += 10;    // real edges exist
  if (pixel_entropy != null && pixel_entropy > 4.0) realPhotoBonus += 10;   // complex image
  realPhotoBonus = Math.min(realPhotoBonus, 50);

  return Math.min(Math.round(colorScore + realPhotoBonus), 100);
}

// ─────────────────────────────────────────────────────────────
// LAYER 3 — Compare image caption with civic domain (0–100)
// ─────────────────────────────────────────────────────────────
function scoreCaptionDomainAlignment(imageCaption, categories) {
  if (!imageCaption || categories.length === 0) return 0;

  const text = imageCaption.toLowerCase();
  let hits = 0;

  for (const cat of categories) {
    const keywords = CIVIC_ONTOLOGY[cat]?.keywords || [];
    // Check if the AI's image description contains any keywords relevant to the complaint categories
    hits += keywords.filter(kw => text.includes(kw)).length;
  }

  // Each keyword hit is strong evidence. Max 100.
  return Math.min(Math.round(hits * 35), 100);
}

// ─────────────────────────────────────────────────────────────
// NON-CIVIC IMAGE DETECTOR
// ─────────────────────────────────────────────────────────────
function isDefinitelyNonCivicImage(detectedObjects, visualSignature, categories) {
  // If YOLO detected objects that exclusively belong to the "non-civic" domain
  const NON_CIVIC_ONLY_CLASSES = new Set([
    'laptop', 'remote', 'keyboard', 'mouse', 'cell phone', 'tv', 'clock',
    'teddy bear', 'book', 'tie', 'hair drier', 'toothbrush', 'scissors',
    'vase', 'frisbee', 'sports ball', 'snowboard', 'skis', 'kite',
    'baseball glove', 'surfboard', 'skateboard', 'umbrella'
  ]);

  if (detectedObjects && detectedObjects.length > 0) {
    const allNonCivic = detectedObjects.every(obj =>
      NON_CIVIC_ONLY_CLASSES.has(obj.object.toLowerCase())
    );
    if (allNonCivic) return true;
  }

  // Digital image with no YOLO objects at all is likely poster/screenshot
  if (
    visualSignature?.is_likely_digital === true &&
    (!detectedObjects || detectedObjects.length === 0)
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// MASTER ALIGNMENT SCORER
// Returns alignmentScore (0–100) with breakdown
// ─────────────────────────────────────────────────────────────
function scoreTextImageAlignment(complaintText, imageCaption, detectedObjects, visualSignature) {
  const categories = identifyComplaintCategories(complaintText);

  // ── Hard reject: image is definitely not civic ──
  if (isDefinitelyNonCivicImage(detectedObjects, visualSignature, categories)) {
    return { alignmentScore: 0, breakdown: { reason: 'Non-civic image detected (digital art / irrelevant objects)' } };
  }

  // ── If no categories identified in complaint, do basic word check ──
  if (categories.length === 0) {
    if (!imageCaption) return { alignmentScore: 0, breakdown: {} };
    const captionWords = imageCaption.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const textWords = complaintText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = textWords.filter(w => captionWords.includes(w)).length;
    const score = Math.min(Math.round((overlap / Math.max(textWords.length, 1)) * 100), 100);
    return { alignmentScore: score, breakdown: { noCivicCategories: true } };
  }

  // ── Layer 1: YOLO alignment (50% weight) ──
  const yoloScore     = scoreYoloAlignment(detectedObjects, categories);
  const yoloExpected  = scoreExpectedYoloClasses(detectedObjects, categories);

  // If YOLO has data, combine both YOLO scores (weighted average)
  let layer1Score = null;
  if (yoloScore !== null) {
    layer1Score = Math.round(yoloScore * 0.6 + yoloExpected * 0.4);
  }

  // ── Layer 2: Visual fingerprint (20% weight) ──
  const layer2Score = scoreVisualSignature(visualSignature, categories);

  // ── Layer 3: Image Caption alignment (30% weight) ──
  const layer3Score = scoreCaptionDomainAlignment(imageCaption, categories);

  // ── Weighted final score ──
  let totalWeight = 0;
  let weightedSum = 0;

  if (layer1Score !== null) {
    weightedSum += layer1Score * 0.50;
    totalWeight  += 0.50;
  }

  if (layer2Score !== null) {
    weightedSum += layer2Score * 0.20;
    totalWeight  += 0.20;
  }

  weightedSum += layer3Score * 0.30;
  totalWeight  += 0.30;

  // Normalize to account for missing layers
  const finalScore = totalWeight > 0
    ? Math.min(Math.round(weightedSum / totalWeight * 100) / 100, 100)
    : 0;

  // ── Bonus: caption text overlap (legacy fallback if caption exists) ──
  let captionBonus = 0;
  if (imageCaption && imageCaption.trim().length > 5) {
    const capLower  = imageCaption.toLowerCase();
    const allKeyHits = categories.flatMap(c =>
      (CIVIC_ONTOLOGY[c]?.keywords || []).filter(kw => capLower.includes(kw))
    ).length;
    captionBonus = Math.min(allKeyHits * 8, 20);
  }

  const final = Math.min(Math.round(finalScore + captionBonus), 100);

  return {
    alignmentScore: final,
    breakdown: {
      categories,
      layer1_yolo: layer1Score,
      layer2_visual: layer2Score,
      layer3_keywords: layer3Score,
      captionBonus,
      visualSignature
    }
  };
}

// ─────────────────────────────────────────────────────────────
// FRAUD VALIDATOR — Main public function
// ─────────────────────────────────────────────────────────────
async function validateImageComplaint({
  complaintText,
  imageCaption,
  detectedObjects,
  photoHash,
  hasExifData,
  visualSignature,
  clipScore // Object from clipVisionService: { alignmentScore, unrelatedScore }
}) {
  const reasons  = [];
  let fraudScore = 0;
  let confidence = 0;

  // ── Compute alignment ──
  const { alignmentScore, breakdown } = scoreTextImageAlignment(
    complaintText, imageCaption, detectedObjects, visualSignature
  );

  // ── Hard non-civic flag ──
  if (breakdown?.reason?.includes('Non-civic')) {
    return {
      isFraud:        true,
      fraudScore:     95,
      confidence:     99,
      reason:         'Image is not a civic issue photo (digital art, poster, or irrelevant objects detected)',
      alignmentScore: 0,
      breakdown
    };
  }

  // ── ML Vision-Language (GPT-4o-mini Vision) (>90% Reliability) ──
  if (clipScore) {
    // OpenAI is very accurate. If it says it's fake or highly unrelated, believe it.
    if (clipScore.isAiFake || clipScore.unrelatedScore > 80) {
      return {
        isFraud:        true,
        fraudScore:     Math.max(clipScore.unrelatedScore, 95),
        confidence:     99,
        reason:         `[AI Vision] ${clipScore.aiReason || 'Image is unrelated to the complaint description'}`,
        alignmentScore: clipScore.alignmentScore || 0,
        breakdown:      { ...breakdown, mlVisionData: clipScore }
      };
    }

    // Boost/Penalty based on gap
    const gap = clipScore.alignmentScore - clipScore.unrelatedScore;
    if (clipScore.alignmentScore < 30 || gap < -20) {
       fraudScore += 75;
       confidence = Math.max(confidence, 98);
       reasons.push(`[AI Vision] Low evidence match: ${clipScore.aiReason}`);
    } else if (clipScore.alignmentScore > 80 && gap > 50) {
       // High Confidence Pass
       fraudScore = 0;
       confidence = 100;
       return {
         isFraud:        false,
         fraudScore:     0,
         confidence:     100,
         reason:         `[AI Vision Verified] ${clipScore.aiReason}`,
         alignmentScore: clipScore.alignmentScore,
         breakdown:      { ...breakdown, mlVisionData: clipScore }
       };
    }
  }

  // ── Heuristic check ──
  if (alignmentScore < 20) {
    fraudScore += 75;
    confidence  = Math.max(confidence, 97);
    reasons.push(`Critical semantic mismatch: image does not match complaint context (${alignmentScore}% coherence)`);
  } else if (alignmentScore < 40) {
    fraudScore += 40;
    confidence  = Math.max(confidence, 80);
    reasons.push(`Low visual-text coherence (${alignmentScore}%). Manual verification recommended`);
  }

  // ── Digital art / poster penalty ──
  if (visualSignature?.is_likely_digital) {
    fraudScore += 85; // Increased from 60
    confidence  = 99;
    reasons.push('Image appears to be a digital graphic, event poster, or screenshot — not a real on-site photo');
  }

  // ── YOLO mismatch hard flag ──
  if (detectedObjects && detectedObjects.length > 0 && breakdown.categories?.length > 0) {
    const yoloL1 = breakdown.layer1_yolo;
    if (yoloL1 !== null && yoloL1 < 10) {
      fraudScore += 30;
      confidence  = Math.max(confidence, 85);
      const detected = detectedObjects.map(o => o.object).join(', ');
      reasons.push(`YOLO mismatch: detected [${detected}] but complaint indicates ${breakdown.categories.join('/')} issue`);
    }
  }

  // ── Missing EXIF ──
  if (!hasExifData && fraudScore > 20) {
    fraudScore += 15;
    reasons.push('No camera EXIF data: image may not be an authentic on-site photograph');
  }

  fraudScore = Math.min(fraudScore, 100);

  if (fraudScore === 0) {
    return {
      isFraud:        false,
      fraudScore:     0,
      confidence:     100,
      reason:         `Visual analysis matched complaint context (${alignmentScore}% coherence across ${breakdown.categories?.join(', ')} domain)`,
      alignmentScore,
      breakdown
    };
  }

  return {
    isFraud:        fraudScore >= 50,
    fraudScore,
    confidence:     Math.min(confidence, 100),
    reason:         reasons.join('; '),
    alignmentScore,
    breakdown
  };
}

module.exports = {
  validateImageComplaint,
  scoreTextImageAlignment,
  identifyComplaintCategories,
  scoreYoloAlignment,
  scoreVisualSignature
};
