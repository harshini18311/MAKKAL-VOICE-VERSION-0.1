const express = require('express');
const { makeOutboundCall } = require('../../ai-services/twilioService');

const router = express.Router();

/**
 * Trigger SOS call via hotkey
 * Expected body: { message: string, ip: string, targetNumber: string }
 */
router.post('/trigger', async (req, res) => {
  try {
    const { message = 'Emergency SOS Alert', ip = '0.0.0.0', targetNumber } = req.body;
    
    if (!targetNumber) {
      return res.status(400).json({ error: 'targetNumber is required' });
    }

    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
    // TwiML endpoint that will handle the call when answered
    const callbackUrl = `${serverUrl}/api/sos/twiml?message=${encodeURIComponent(message)}&ip=${encodeURIComponent(ip)}`;

    const result = await makeOutboundCall(targetNumber, callbackUrl);
    console.log(`[SOS] Call initiated to ${targetNumber}: ${result.sid}`);

    res.json({ success: true, callSid: result.sid });
  } catch (error) {
    console.error('[SOS] Trigger error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Return TwiML for the SOS call
 */
router.all('/twiml', (req, res) => {
  const { message, ip } = req.query;
  const { generateSOSTwiML } = require('../../ai-services/twilioService');
  
  const xml = generateSOSTwiML(message, ip);
  res.type('application/xml').send(xml);
});

module.exports = router;
