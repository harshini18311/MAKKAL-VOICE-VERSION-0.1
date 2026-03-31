const exifr = require('exifr');
const geoip = require('geoip-lite');
const Complaint = require('../models/Complaint');
const config = require('../config/verificationConfig');
const { loadBoundaryFeature } = require('../utils/boundaryLoader');
const { pointInBoundary, haversineMeters, cosineSimilarity } = require('../utils/geoHelpers');
const { validateAddress } = require('./addressVerification');
const {
  verifyImageContent,
  getEmbeddings,
  embedImageProxyCaption,
  detectImageManipulation,
  estimateSceneLightingConsistency
} = require('../../ai-services/aiService');

function categoryToDept(category) {
  const map = {
    Water: 'WTR',
    Road: 'ROD',
    Electricity: 'ELC',
    Infrastructure: 'INF',
    'Public Safety': 'PUB',
    Sanitation: 'SAN',
    Traffic: 'TRF',
    'Government Services': 'GOV',
    'Rural specific': 'RUR',
    Other: 'GEN'
  };
  return map[category] || 'GEN';
}

function descriptionShingles(text) {
  if (!text || typeof text !== 'string') return '';
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 48).join('|');
}

function weightedFinal(contributions) {
  const w = config.categoryWeights;
  let sum = 0;
  let tw = 0;
  for (const k of Object.keys(w)) {
    if (contributions[k] == null) continue;
    sum += contributions[k] * w[k];
    tw += w[k];
  }
  if (tw === 0) return 50;
  return Math.round(sum / tw);
}

async function extractExif(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image')) {
    return null;
  }
  try {
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    return await exifr.parse(buf, { pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate'] });
  } catch (e) {
    console.warn('EXIF parse failed:', e.message);
    return null;
  }
}

function parseClientGps(body) {
  const lat = body.lat != null ? Number(body.lat) : body.latitude != null ? Number(body.latitude) : NaN;
  const lng = body.lng != null ? Number(body.lng) : body.longitude != null ? Number(body.longitude) : NaN;
  const gpsCapturedAt = body.gpsCapturedAt != null ? Number(body.gpsCapturedAt) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, gpsCapturedAt };
}

/**
 * Stages 2–3: identity/trust + geo/EXIF (runs before AI text analysis).
 */
async function runStages2and3(req, user) {
  const results = {
    stage2: { status: 'PASS', flags: [], contribution: user.trustScore },
    stage3: { status: 'PASS', flags: [], contribution: 100 }
  };
  const flags = [];
  const { fingerprint } = req.body || {};

  if (!user.phoneVerified) {
    results.stage2.status = 'REVIEW_REQUIRED';
    results.stage2.flags.push('phone_not_verified');
    flags.push('phone_not_verified');
    results.stage2.contribution = Math.max(0, user.trustScore - 20);
  }

  if (fingerprint) {
    const isNewFp = !user.deviceFingerprints.includes(fingerprint);
    if (isNewFp && user.deviceFingerprints.length >= 2) {
      results.stage2.flags.push('possible_sim_swap');
      flags.push('possible_sim_swap');
      results.stage2.contribution = Math.max(0, results.stage2.contribution - 15);
    }
    if (isNewFp) {
      user.deviceFingerprints.push(fingerprint);
    }
    user.deviceSignatures = user.deviceSignatures || [];
    const ua = req.headers['user-agent'] || '';
    const existing = user.deviceSignatures.find((s) => s.hash === fingerprint);
    if (existing) {
      existing.lastSeen = new Date();
      existing.userAgent = ua;
    } else {
      user.deviceSignatures.push({ hash: fingerprint, userAgent: ua, lastSeen: new Date() });
    }
    await user.save();
  }

  if (user.trustScore < config.trust.lowMandatoryReview) {
    results.stage2.flags.push('low_trust_user');
    flags.push('low_trust_user');
  }

  let exifData = { extracted: false };
  const image = req.body?.image;
  if (image && image.startsWith('data:image')) {
    const exif = await extractExif(image);
    if (exif) {
      exifData = {
        extracted: true,
        exifLat: exif.latitude,
        exifLng: exif.longitude,
        exifTime: exif.DateTimeOriginal || exif.CreateDate || null
      };
    }
  } else if (image) {
    results.stage3.status = 'FAIL';
    results.stage3.flags.push('missing_evidence');
    flags.push('missing_evidence');
    results.stage3.contribution = 40;
  }

  const gps = parseClientGps(req.body || {});
  if (gps) {
    const age = gps.gpsCapturedAt ? Date.now() - gps.gpsCapturedAt : 0;
    if (gps.gpsCapturedAt && age > config.gpsMaxAgeMs) {
      results.stage3.flags.push('stale_gps');
      flags.push('stale_gps');
      results.stage3.contribution = Math.max(20, results.stage3.contribution - 25);
    }

    const boundary = loadBoundaryFeature();
    const inside = pointInBoundary(gps.lng, gps.lat, boundary);
    if (!inside.inside && !inside.skipped) {
      results.stage3.flags.push('suspicious_location');
      flags.push('suspicious_location');
      results.stage3.contribution = Math.max(10, results.stage3.contribution - 30);
    }

    if (exifData.exifLat != null && exifData.exifLng != null) {
      const dm = haversineMeters(gps.lat, gps.lng, exifData.exifLat, exifData.exifLng);
      if (dm > config.exifDistanceMaxM) {
        results.stage3.flags.push('exif_coordinate_mismatch');
        flags.push('exif_coordinate_mismatch');
        results.stage3.contribution = Math.max(15, results.stage3.contribution - 25);
      }
    }

    if (exifData.exifTime) {
      const exifT = new Date(exifData.exifTime).getTime();
      if (Number.isFinite(exifT)) {
        const hours = Math.abs(Date.now() - exifT) / 3600000;
        if (hours > config.exifTimeMaxHours) {
          results.stage3.flags.push('stale_timestamp');
          flags.push('stale_timestamp');
          results.stage3.contribution = Math.max(20, results.stage3.contribution - 15);
        }
      }
    }
  } else {
    results.stage3.flags.push('no_client_gps');
    flags.push('no_client_gps');
    results.stage3.contribution = Math.max(30, results.stage3.contribution - 20);
  }

  const addressText = req.body?.location || '';
  if (addressText) {
    const addrVal = await validateAddress(addressText, gps?.lat, gps?.lng);
    if (addrVal.flags.length > 0) {
      results.stage3.flags.push(...addrVal.flags);
      flags.push(...addrVal.flags);
      const penalty = 100 - addrVal.score;
      if (penalty > 0) {
        results.stage3.contribution = Math.max(0, results.stage3.contribution - penalty);
      }
    }
  }


  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || '';
  if (gps && ip && ip !== '127.0.0.1' && ip !== '::1') {
    const g = geoip.lookup(ip);
    if (g?.ll) {
      const km = haversineMeters(g.ll[0], g.ll[1], gps.lat, gps.lng) / 1000;
      if (km > config.ipGpsMaxKm) {
        results.stage3.flags.push('vpn_detected');
        flags.push('vpn_detected');
        results.stage3.contribution = Math.max(25, results.stage3.contribution - 20);
      }
    }
  }

  req.exifData = exifData;
  return { results, flags, exifData };
}

async function runStages4567({
  user,
  body,
  aiResult,
  stage23
}) {
  const results = {
    stage4: { status: 'PASS', flags: [], contribution: 100 },
    stage5: { status: 'PASS', flags: [], contribution: 100, duplicateOf: null, similarity: 0 },
    stage6: { status: 'PASS', flags: [], contribution: 100 }
  };
  const flags = [];
  const text = body.text || body.complaintText || '';
  const image = body.image;
  const category = aiResult.category || 'Other';

  let visionForEmbed = { match: true, confidence: 0.75, detected: category };

  if (image && image.startsWith('data:image')) {
    visionForEmbed = await verifyImageContent(image, category);
    const conf = typeof visionForEmbed.confidence === 'number' ? visionForEmbed.confidence : 0.5;
    const match = visionForEmbed.match !== false;
    if (!match || conf < config.visionCategoryMismatchMaxConfidence) {
      results.stage4.flags.push('object_category_mismatch');
      flags.push('object_category_mismatch');
      results.stage4.contribution = Math.max(5, results.stage4.contribution - 42);
    }

    const manip = await detectImageManipulation(image);
    if (manip.manipulated || (typeof manip.score === 'number' && manip.score > 0.65)) {
      results.stage4.flags.push('image_manipulation_detected');
      flags.push('image_manipulation_detected');
      results.stage4.contribution = Math.max(5, results.stage4.contribution - 38);
    }

    const textEmbStage = await getEmbeddings(text);
    const labelStr = `Category: ${category}. Vision: ${visionForEmbed.detected || ''}`;
    const labelEmb = await getEmbeddings(labelStr);
    if (textEmbStage && labelEmb) {
      const sim = cosineSimilarity(textEmbStage, labelEmb);
      if (sim < config.semanticContradictionMinSimilarity) {
        results.stage4.flags.push('description_image_contradiction');
        flags.push('description_image_contradiction');
        results.stage4.contribution = Math.max(5, results.stage4.contribution - 35);
      }
    }

    await estimateSceneLightingConsistency(image, new Date().toISOString());
  }

  const textEmb = await getEmbeddings(text);
  const imageEmb = await embedImageProxyCaption(
    typeof visionForEmbed?.detected === 'string' ? visionForEmbed.detected : category
  );

  const gps = parseClientGps(body);
  let best = { sim: 0, id: null };
  if (gps) {
    const since = new Date(Date.now() - config.duplicateLookbackDays * 86400000);
    const candidates = await Complaint.find({
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [gps.lng, gps.lat] },
          $maxDistance: config.duplicateRadiusM
        }
      },
      createdAt: { $gte: since }
    })
      .select('embeddings complaintText category')
      .limit(80)
      .lean();

    for (const c of candidates) {
      let simT = 0;
      let simI = 0;
      if (textEmb && c.embeddings?.text?.length) {
        simT = cosineSimilarity(textEmb, c.embeddings.text);
      }
      if (imageEmb && c.embeddings?.image?.length) {
        simI = cosineSimilarity(imageEmb, c.embeddings.image);
      }
      const combined = textEmb && imageEmb ? simT * 0.5 + simI * 0.5 : simT || simI;
      if (combined > best.sim) {
        best = { sim: combined, id: c._id };
      }
    }
  }

  results.stage5.similarity = best.sim;
  if (best.sim >= config.duplicateCosineHigh) {
    results.stage5.status = 'DUPLICATE';
    results.stage5.flags.push('duplicate');
    flags.push('duplicate');
    results.stage5.duplicateOf = best.id;
    results.stage5.contribution = 5;
  } else if (best.sim >= config.duplicateCosineRelated) {
    results.stage5.status = 'RELATED';
    results.stage5.flags.push('possible_related_complaint');
    flags.push('possible_related_complaint');
    results.stage5.duplicateOf = best.id;
    results.stage5.contribution = 55;
  }

  if (gps) {
    const since = new Date(Date.now() - config.cluster.windowMs);
    const nearby = await Complaint.find({
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [gps.lng, gps.lat] },
          $maxDistance: config.cluster.radiusM
        }
      },
      createdAt: { $gte: since }
    })
      .select('user')
      .lean();
    const users = new Set(nearby.map((n) => String(n.user)));
    if (users.size >= config.cluster.minAccounts) {
      results.stage6.status = 'REVIEW_REQUIRED';
      results.stage6.flags.push('coordinated_cluster_flag');
      flags.push('coordinated_cluster_flag');
      results.stage6.contribution = 15;
    }
  }

  const s2 = stage23?.results?.stage2?.contribution ?? user.trustScore;
  const s3 = stage23?.results?.stage3?.contribution ?? 100;
  const contributions = {
    firewall: 100,
    identityTrust: typeof s2 === 'number' ? s2 : user.trustScore,
    geoExif: typeof s3 === 'number' ? s3 : 100,
    aiContent: results.stage4.contribution,
    duplicateRelated: results.stage5.contribution,
    behavioural: results.stage6.contribution
  };

  let finalScore = weightedFinal(contributions);
  if (user.trustScore > config.trust.highExpedite) {
    finalScore = Math.min(100, finalScore + 5);
  }
  if (user.trustScore < config.trust.lowMandatoryReview) {
    finalScore = Math.min(finalScore, 65);
  }

  const mergedFlags = [...(stage23?.flags || []), ...flags];
  const serious = config.seriousFakeFlags || [];
  const seriousCount = mergedFlags.filter((f) => serious.includes(f)).length;
  const stackPenalty =
    seriousCount > 1 ? (seriousCount - 1) * (config.fakeStackPenaltyPerFlag ?? 6) : 0;
  finalScore = Math.max(0, Math.round(finalScore - stackPenalty));

  let decision = 'HUMAN_REVIEW';
  if (results.stage5.status === 'DUPLICATE') {
    decision = 'DUPLICATE';
  } else if (results.stage5.status === 'RELATED') {
    decision = 'RELATED';
  } else if (finalScore > config.thresholds.real) {
    decision = 'REAL';
  } else if (finalScore >= config.thresholds.reviewMin) {
    decision = 'HUMAN_REVIEW';
  } else {
    decision = 'FAKE';
  }

  const forceFake =
    seriousCount >= (config.fakeForceMinSeriousFlags ?? 3) &&
    finalScore <= (config.fakeForceMaxScore ?? 52);
  if (forceFake && decision !== 'DUPLICATE' && decision !== 'RELATED') {
    decision = 'FAKE';
  }

  if (user.trustScore < config.trust.lowMandatoryReview) {
    if (decision === 'REAL') {
      decision = 'HUMAN_REVIEW';
    }
  }
  if (results.stage6.flags.includes('coordinated_cluster_flag')) {
    decision = 'HUMAN_REVIEW';
  }

  return {
    results456: results,
    flags,
    finalScore,
    decision,
    textEmb,
    imageEmb,
    bestDuplicate: best,
    shingles: descriptionShingles(text),
    categoryDept: categoryToDept(category)
  };
}

module.exports = {
  runStages2and3,
  runStages4567,
  parseClientGps,
  descriptionShingles,
  categoryToDept,
  weightedFinal
};
