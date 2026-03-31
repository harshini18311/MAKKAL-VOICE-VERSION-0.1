import axios from 'axios';
import { TN_NOMINATIM_VIEWBOX, isWithinTamilNaduBounds } from './tamilNaduGeo';

const NOMINATIM_HEADERS = {
  'Accept-Language': 'en-IN,en,ta;q=0.8',
  'User-Agent': 'MakkalVoice-TamilNadu-App/1.0 (contact: local-dev)'
};

/**
 * Reverse geocode with higher zoom for street / village-level detail in Tamil Nadu.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: {
        format: 'jsonv2',
        lat: lat,
        lon: lng,
        zoom: 18,
        addressdetails: 1
      },
      headers: NOMINATIM_HEADERS
    });

    if (response.data && response.data.display_name) {
      let fullAddress = response.data.display_name;
      const addr = response.data.address || {};

      if (addr.country) fullAddress = fullAddress.replace(new RegExp(`,? ?${addr.country}$`), '');
      if (addr.postcode) fullAddress = fullAddress.replace(new RegExp(`,? ?${addr.postcode}$`), '');

      const trimmed = fullAddress.trim();
      if (!isWithinTamilNaduBounds(lat, lng)) {
        return `${trimmed} (outside Tamil Nadu — verify on map)`;
      }
      return trimmed;
    }
    return `${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`;
  } catch (error) {
    console.error('Reverse Geocoding Error:', error.message);
    return `${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`;
  }
}

/**
 * Search places biased to Tamil Nadu (Nominatim viewbox + India filter).
 */
export async function searchPlacesTamilNadu(query) {
  const q = query.trim();
  if (!q) return [];

  const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
    params: {
      q: `${q}, Tamil Nadu, India`,
      format: 'jsonv2',
      limit: 12,
      addressdetails: 1,
      countrycodes: 'in',
      viewbox: TN_NOMINATIM_VIEWBOX
    },
    headers: NOMINATIM_HEADERS
  });

  const rows = response.data || [];
  return rows
    .map((r) => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      displayName: r.display_name,
      address: r.address
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && isWithinTamilNaduBounds(r.lat, r.lon));
}

export { isWithinTamilNaduBounds };
