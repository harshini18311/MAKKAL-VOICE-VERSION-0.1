/**
 * Tamil Nadu, India — approximate geographic bounds for map focus and Nominatim bias.
 * (Slightly padded for coastal / border UX.)
 */
export const TN_CENTER = { lat: 11.059, lng: 78.389 };

/** South-west and north-east corners [lat, lng] for Leaflet maxBounds */
export const TN_SW = [8.05, 76.12];
export const TN_NE = [13.55, 80.4];

/** Nominatim viewbox: min lon, max lat, max lon, min lat (left, top, right, bottom) */
export const TN_NOMINATIM_VIEWBOX = '76.12,13.55,80.40,8.05';

export function isWithinTamilNaduBounds(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return la >= TN_SW[0] && la <= TN_NE[0] && lo >= TN_SW[1] && lo <= TN_NE[1];
}
