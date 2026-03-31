const fs = require('fs');
const path = require('path');

let cachedFeature = undefined;
let cacheTried = false;

/**
 * Loads GeoJSON Polygon or Feature from BOUNDARY_GEOJSON_PATH or default file.
 * If missing/invalid, returns null (geofence skipped).
 */
function loadBoundaryFeature() {
  if (cacheTried) return cachedFeature === undefined ? null : cachedFeature;
  cacheTried = true;
  const envPath = process.env.BOUNDARY_GEOJSON_PATH;
  const defaultPath = path.join(__dirname, '../data/default-boundary.geojson');
  const tryPaths = [envPath, defaultPath].filter(Boolean);

  for (const p of tryPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (raw.type === 'Feature' && (raw.geometry?.type === 'Polygon' || raw.geometry?.type === 'MultiPolygon')) {
        cachedFeature = raw;
        return cachedFeature;
      }
      if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
        cachedFeature = { type: 'Feature', properties: {}, geometry: raw };
        return cachedFeature;
      }
    } catch (e) {
      console.warn('boundaryLoader: could not load', p, e.message);
    }
  }
  cachedFeature = null;
  return null;
}

module.exports = { loadBoundaryFeature };
