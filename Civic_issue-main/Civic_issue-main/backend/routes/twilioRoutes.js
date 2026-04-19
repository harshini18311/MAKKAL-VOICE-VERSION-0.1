const express = require('express');
const axios = require('axios');
const Complaint = require('../models/Complaint');
const { analyzeComplaint } = require('../../ai-services/aiService');
const { transcribeAudio } = require('../../ai-services/speechService');
const { sendEmailNotification } = require('../../ai-services/emailService');

const router = express.Router();

// Twilio Webhook when someone calls the Toll-Free number
router.post('/incoming', (req, res) => {
  const twiml = `
    <Response>
      <Say voice="alice">Welcome to the Rural Voice Complaint System. Please state your name, village, and complaint after the beep. Press any key to finish.</Say>
      <Record action="/api/twilio/recording" maxLength="60" />
    </Response>
  `;
  res.type('text/xml');
  res.send(twiml);
});

// Twilio Webhook when recording is ready
router.post('/recording', async (req, res) => {
  try {
    const recordingUrl = req.body.RecordingUrl;
    const phone = req.body.From; // Caller's number

    // 1. Download audio from Twilio
    const audioRes = await axios.get(recordingUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioRes.data);

    // 2. Agentic Pipeline: Speech to Text
    const text = await transcribeAudio(audioBuffer);

    // 3. Agentic Pipeline: Llama 3 Analysis
    const aiResult = await analyzeComplaint(text);

    // 4. Save to DB
    const trackingId = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
    const complaint = await Complaint.create({
      user: null, // Anonymous or lookup by phone
      name: 'Caller',
      village: 'Unknown (via Call)',
      complaintText: text,
      category: aiResult.category || 'Other',
      priority: aiResult.priority || 'Medium',
      summary: aiResult.summary || text.substring(0, 100),
      trackingId,
      status: 'Pending'
    });

    // 5. Automated Notification
    await sendEmailNotification(complaint);

    // 6. Respond to Twilio hanging up
    const twiml = `
      <Response>
        <Say voice="alice">Thank you. Your complaint has been registered with tracking ID ${trackingId}. Authorities have been notified. Goodbye.</Say>
      </Response>
    `;
    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('Twilio Recording Processing Error:', error);
    const twiml = `
      <Response>
        <Say voice="alice">Sorry, there was an error processing your complaint. Please try again later.</Say>
      </Response>
    `;
    res.type('text/xml');
    res.send(twiml);
  }
});

// ─── NEW: SMS Incoming Handler ───
// Receive SMS from citizen, process with AI, and trigger callback with confirmation

router.post('/sms', async (req, res) => {
  try {
    const smsText = req.body.Body || ''; // SMS message body
    const smsFrom = req.body.From; // Caller's phone number

    console.log(`\n[SMS RECEIVED] From: ${smsFrom} | Message: ${smsText}`);

    // Respond immediately to Twilio to confirm receipt
    const twimlResponse = `
      <Response>
        <Message>Thank you. Your complaint has been received. We will call you shortly with confirmation and tracking ID.</Message>
      </Response>
    `;
    res.type('text/xml');
    res.send(twimlResponse);

    // ─── Async processing (non-blocking) ───
    // Process SMS and trigger callback in background

    // 1. Parse SMS text with AI
    const aiResult = await analyzeComplaint(smsText, 'SMS Citizen', 'Via SMS');

    // 2. Create complaint record
    const trackingId = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
    const complaint = await Complaint.create({
      user: null,
      name: 'SMS Citizen',
      location: 'Via SMS',
      complaintText: smsText,
      category: aiResult.category || 'Other',
      priority: aiResult.priority || 'Medium',
      summary: aiResult.summary || smsText.substring(0, 100),
      emailDraft: aiResult.emailDraft,
      trackingId,
      status: 'Pending',
      sourceIp: req.ip
    });

    // 3. Send email notification to relevant department
    await sendEmailNotification(complaint);

    // 4. Trigger AI callback to user
    await triggerAICallback(smsFrom, trackingId, aiResult, smsText);

  } catch (error) {
    console.error('SMS Processing Error:', error);
    // Still respond 200 so Twilio doesn't retry
    res.sendStatus(200);
  }
});

// ─── Helper: Trigger outbound AI callback ───

async function triggerAICallback(userPhone, trackingId, aiResult, originalText) {
  try {
    // Build AI voice message for callback
    const callMessage = `
Your civic complaint has been registered successfully.
Tracking ID: ${trackingId}.
Category: ${aiResult.category || 'Other'}.
Priority level: ${aiResult.priority || 'Medium'}.
Summary: ${aiResult.summary || originalText.substring(0, 50)}.
Authorities have been notified and will contact you for further details.
Thank you for helping us improve your community.
    `;

    if (twilioClient) {
      // Option 1: Use Twilio SDK for direct outbound call
      await twilioClient.calls.create({
        to: userPhone,
        from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
        twiml: `
          <Response>
            <Say voice="alice">${callMessage}</Say>
          </Response>
        `
      });
      console.log(`✅ AI Callback initiated to ${userPhone} with tracking ID ${trackingId}`);
    } else {
      // Option 2: Fallback — log callback intent
      console.log(`[CALLBACK MOCK] Would call ${userPhone} with message about tracking ID ${trackingId}`);
    }
  } catch (error) {
    console.error(`❌ AI Callback failed for ${userPhone}:`, error.message);
  }
}

module.exports = router;
