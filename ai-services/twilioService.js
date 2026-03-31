/**
 * Twilio Voice API Service
 *
 * Provides REST API client for Twilio voice operations:
 *   - Make outbound calls (connect to TwiML flow)
 *   - Generate TwiML responses
 *
 * Credentials required in .env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

const twilio = require('twilio');

/**
 * Get Twilio config from environment variables.
 * @returns {{ accountSid, authToken, phoneNumber }}
 */
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  };
}

/**
 * Create an authenticated Twilio client.
 */
function getTwilioClient() {
  const config = getTwilioConfig();
  if (!config.accountSid || !config.authToken) {
    throw new Error('Twilio credentials not set. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env');
  }
  return new twilio(config.accountSid, config.authToken);
}

/**
 * Make an outbound call via Twilio.
 * 
 * @param {string} to — Phone number to call (E.164 format)
 * @param {string} url — URL that returns TwiML to control the call flow
 * @returns {Promise<object>} — Twilio call response
 */
async function makeOutboundCall(to, url) {
  const config = getTwilioConfig();
  const client = getTwilioClient();

  return await client.calls.create({
    url: url,
    to: to,
    from: config.phoneNumber
  });
}

/**
 * Generate a TwiML response for an SOS call.
 * @param {string} message - The message to speak
 * @param {string} ip - The caller's IP (from hackathon project)
 * @returns {string} - TwiML XML
 */
function generateSOSTwiML(message, ip) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  
  // Format IP for clearer speech
  const formattedIP = ip.replace(/\./g, ' dot ').replace(/\d/g, '$& ').trim();
  
  response.say(`${message}. My IP address is ${formattedIP}`);
  return response.toString();
}

module.exports = {
  getTwilioConfig,
  getTwilioClient,
  makeOutboundCall,
  generateSOSTwiML
};
