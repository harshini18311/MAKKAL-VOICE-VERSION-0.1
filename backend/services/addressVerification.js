const axios = require('axios');
const { haversineMeters } = require('../utils/geoHelpers');

/**
 * Validates an Indian PIN code using the PostalPincode API.
 */
async function verifyPinCode(pin) {
  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${pin}`, { timeout: 3000 });
    const data = res.data[0];
    if (data.Status === 'Success' && data.PostOffice && data.PostOffice.length > 0) {
      return {
        valid: true,
        region: data.PostOffice[0].Region,
        state: data.PostOffice[0].State,
        district: data.PostOffice[0].District
      };
    }
  } catch (e) {
    console.warn(`[Address Verification] PIN lookup failed for ${pin}:`, e.message);
  }
  return { valid: false };
}

/**
 * Geocodes an address string using Nominatim (OpenStreetMap).
 */
async function geocodeAddress(address) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: address, format: 'json', addressdetails: 1, limit: 1 },
      headers: { 'User-Agent': 'MakkalVoice-TamilNadu-App/1.0' },
      timeout: 5000
    });
    if (res.data && res.data.length > 0) {
      const match = res.data[0];
      return {
        lat: parseFloat(match.lat),
        lng: parseFloat(match.lon),
        address: match.address
      };
    }
  } catch (e) {
    console.warn(`[Address Verification] Geocoding failed:`, e.message);
  }
  return null;
}

/**
 * Smart Address Validation combining Pincode, Address string, and Client GPS.
 */
async function validateAddress(addressText, clientGpsLat, clientGpsLng) {
  const result = {
    flags: [],
    score: 100, // Starts at 100
    pinValid: null,
    geocoded: null,
    distanceFromGps: null
  };

  // 1. Extract PIN code
  const pinMatch = addressText.match(/\b([1-9][0-9]{5})\b/);
  
  // 2. Geocode the textual address
  const geo = await geocodeAddress(addressText);
  if (geo) {
    result.geocoded = geo;
  } else {
    result.flags.push('address_not_found_geocoder');
    result.score -= 20;
  }

  // 3. Verify PIN if found
  if (pinMatch) {
    const pin = pinMatch[1];
    const pinData = await verifyPinCode(pin);
    result.pinValid = pinData.valid;
    
    if (!pinData.valid) {
      result.flags.push('invalid_pincode_in_address');
      result.score -= 25;
    } else if (geo && geo.address && geo.address.postcode) {
      // Compare PIN code from text with Geocoded PIN
      if (geo.address.postcode !== pin) {
        result.flags.push('pincode_mismatch_geocoder');
        result.score -= 15;
      }
    }
    
    // Check if it's outside Tamil Nadu
    if (pinData.valid && pinData.state !== 'Tamil Nadu') {
        result.flags.push('pincode_outside_tamil_nadu');
        result.score -= 50;
    }
  } else {
    result.flags.push('no_pincode_provided');
    result.score -= 10;
  }

  // 4. Compare with Client GPS if available
  if (geo && typeof clientGpsLat === 'number' && typeof clientGpsLng === 'number' && !isNaN(clientGpsLat) && !isNaN(clientGpsLng)) {
    const distanceMeters = haversineMeters(geo.lat, geo.lng, clientGpsLat, clientGpsLng);
    result.distanceFromGps = distanceMeters;
    
    // If geocoded address is more than 15km away from user's actual GPS
    if (distanceMeters > 15000) {
      result.flags.push('address_far_from_gps');
      result.score -= 30;
    }
  }

  return result;
}

module.exports = {
  verifyPinCode,
  geocodeAddress,
  validateAddress
};
