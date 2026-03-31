/**
 * Exotel Voice API Service
 *
 * Provides REST API client for Exotel voice operations:
 *   - Make outbound calls (connect to applet flow)
 *   - Get call details (status, recording URL)
 *   - Health check for credential validation
 *
 * Credentials required in .env:
 *   EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_ACCOUNT_SID,
 *   EXOTEL_EXOPHONE, EXOTEL_SUBDOMAIN
 */

const axios = require('axios');

/**
 * Get Exotel config from environment variables.
 * @returns {{ apiKey, apiToken, accountSid, exophone, subdomain, baseUrl }}
 */
function getExotelConfig() {
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const exophone = process.env.EXOTEL_EXOPHONE;
  const subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com';

  return {
    apiKey,
    apiToken,
    accountSid,
    exophone,
    subdomain,
    baseUrl: `https://${subdomain}/v1/Accounts/${accountSid}`
  };
}

/**
 * Create an authenticated Axios client for Exotel API.
 * Uses HTTP Basic Auth (API Key = username, API Token = password).
 */
function getExotelClient() {
  const config = getExotelConfig();

  if (!config.apiKey || !config.apiToken || !config.accountSid) {
    throw new Error(
      'Exotel credentials not set. Add EXOTEL_API_KEY, EXOTEL_API_TOKEN, and EXOTEL_ACCOUNT_SID to .env'
    );
  }

  return axios.create({
    baseURL: config.baseUrl,
    auth: {
      username: config.apiKey,
      password: config.apiToken
    },
    timeout: 30000
  });
}

/**
 * Make an outbound call via Exotel.
 * Calls the "From" number first, then connects to the given applet/URL.
 *
 * @param {string} to — Phone number to call (E.164 or local format)
 * @param {string} callbackUrl — URL that returns ExoML to control the call flow
 * @returns {Promise<object>} — Exotel call response (contains CallSid etc.)
 */
async function makeOutboundCall(to, callbackUrl) {
  const config = getExotelConfig();
  const client = getExotelClient();

  const formData = new URLSearchParams();
  formData.append('From', to);
  formData.append('CallerId', config.exophone);
  formData.append('Url', callbackUrl);

  // Optional: add status callback
  const statusCallbackUrl = process.env.EXOTEL_STATUS_CALLBACK;
  if (statusCallbackUrl) {
    formData.append('StatusCallback', statusCallbackUrl);
    formData.append('StatusCallbackEvents[0]', 'terminal');
    formData.append('StatusCallbackEvents[1]', 'answered');
    formData.append('StatusCallbackContentType', 'application/json');
  }

  const response = await client.post('/Calls/connect.json', formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data;
}

/**
 * Get details of a specific call.
 * @param {string} callSid — Exotel Call SID
 * @returns {Promise<object>} — Call details (status, duration, recording URL, etc.)
 */
async function getCallDetails(callSid) {
  const client = getExotelClient();
  const response = await client.get(`/Calls/${callSid}.json`);
  return response.data;
}

/**
 * Validate Exotel credentials by making a lightweight API call.
 * @returns {Promise<boolean>}
 */
async function validateCredentials() {
  try {
    const client = getExotelClient();
    // Attempt to list recent calls (limit 1)
    await client.get('/Calls.json?PageSize=1');
    return true;
  } catch (err) {
    console.error('[Exotel] Credential validation failed:', err.message);
    return false;
  }
}

module.exports = {
  getExotelConfig,
  getExotelClient,
  makeOutboundCall,
  getCallDetails,
  validateCredentials
};
