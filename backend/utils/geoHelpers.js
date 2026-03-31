const turf = require('@turf/turf');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/**
 * @param {number} lng
 * @param {number} lat
 * @param {import('@turf/helpers').Feature<import('@turf/helpers').Polygon|import('@turf/helpers').MultiPolygon>|null} boundaryFeature
 */
function pointInBoundary(lng, lat, boundaryFeature) {
  if (!boundaryFeature) return { inside: true, skipped: true };
  const pt = turf.point([lng, lat]);
  return { inside: turf.booleanPointInPolygon(pt, boundaryFeature), skipped: false };
}

function cosineSimilarity(a, b) {
  if (!a || !b || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { haversineKm, haversineMeters, pointInBoundary, cosineSimilarity };
