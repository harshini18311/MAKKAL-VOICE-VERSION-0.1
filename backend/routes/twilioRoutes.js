/**
 * Twilio IVR Routes — TwiML-based webhook endpoints
 * 
 * Ported from Exotel-based implementation to Twilio.
 */

const express = require('express');
const axios = require('axios');
const twilio = require('twilio');
const Complaint = require('../models/Complaint');
const { transcribeAudio } = require('../../ai-services/speechService');
const { structureComplaint } = require('../../ai-services/aiService');
const { classifyComplaint } = require('../../ai-services/classificationAgent');
const { sendEmailNotification } = require('../../ai-services/emailService');
const { handleCriticalSeverityCC } = require('../services/escalationService');
const { appendAuditLog } = require('../services/auditService');
const { getLanguageFromDTMF, buildLanguageMenuPrompt } = require('../../ai-services/languageRouter');
const { getPrompts } = require('../../ai-services/prompts');

const router = express.Router();

// In-memory store for multi-step IVR sessions
const twilioSessions = new Map();

// ─────────────────────────────────────────────
// Ticket ID Generator: GR-YYYY-HHMMSS##
// ─────────────────────────────────────────────
function generateTicketId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `GR-${yyyy}-${hh}${mm}${ss}${rand}`;
}

/**
 * Build TwiML response.
 * @param {Function} callback — (response) => { ... }
 * @returns {string} — complete TwiML XML string
 */
function twiml(callback) {
  const response = new twilio.twiml.VoiceResponse();
  callback(response);
  return response.toString();
}

/**
 * Helper to get public server URL.
 */
function getServerUrl(req) {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/**
 * Download recording from Twilio URL.
 */
async function downloadRecording(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN
    }
  });
  return Buffer.from(response.data);
}

// ─────────────────────────────────────────────
// Step 1: Incoming Call → Language Selection
// ─────────────────────────────────────────────
router.all('/incoming', (req, res) => {
  const callSid = req.body.CallSid || 'unknown';
  const callerNumber = req.body.From || 'unknown';

  console.log(`[Twilio] Incoming call ${callSid} from ${callerNumber}`);

  // Initialize session
  twilioSessions.set(callSid, {
    callerPhone: callerNumber,
    startTime: new Date(),
    language: null,
    recordings: {}
  });

  const serverUrl = getServerUrl(req);
  const menuPrompt = buildLanguageMenuPrompt();
  const prompts = getPrompts('en-IN');

  const xml = twiml(r => {
    r.say(prompts.welcome);
    const gather = r.gather({
      action: `${serverUrl}/api/twilio/language-selected`,
      method: 'POST',
      numDigits: 1,
      timeout: 10
    });
    gather.say(menuPrompt);
    r.say(prompts.noInput);
    r.redirect(`${serverUrl}/api/twilio/collect-name?lang=3`);
  });

  res.type('application/xml');
  res.send(xml);
});

// ─────────────────────────────────────────────
// Step 2: Language Selected → Start Collection
// ─────────────────────────────────────────────
router.all('/language-selected', (req, res) => {
  const callSid = req.body.CallSid || 'unknown';
  const digit = req.body.Digits || '3';

  const language = getLanguageFromDTMF(digit);
  console.log(`[Twilio] Call ${callSid} selected language: ${language.name} (${language.bcp47})`);

  // Update session
  const session = twilioSessions.get(callSid);
  if (session) {
    session.language = language;
  }

  const serverUrl = getServerUrl(req);
  const prompts = getPrompts(language.bcp47);

  const xml = twiml(r => {
    r.say(prompts.langSelected);
    r.redirect(`${serverUrl}/api/twilio/collect-name?lang=${digit}`);
  });

  res.type('application/xml');
  res.send(xml);
});

// ─────────────────────────────────────────────
// Step 3: Collect Name via Recording
// ─────────────────────────────────────────────
router.all('/collect-name', (req, res) => {
  const callSid = req.body.CallSid || 'unknown';
  const lang = req.query.lang || req.body.lang || '3';
  const serverUrl = getServerUrl(req);
  const language = getLanguageFromDTMF(lang);
  const prompts = getPrompts(language.bcp47);

  const xml = twiml(r => {
    r.say(prompts.askName);
    r.record({
      action: `${serverUrl}/api/twilio/collect-address?lang=${lang}&field=name`,
      method: 'POST',
      maxLength: 15,
      timeout: 5,
      finishOnKey: '#',
      playBeep: true
    });
    r.say(prompts.noInput);
    r.redirect(`${serverUrl}/api/twilio/collect-name?lang=${lang}`);
  });

  res.type('application/xml');
  res.send(xml);
});

// ─────────────────────────────────────────────
// Step 4: Collect Address via Recording
// ─────────────────────────────────────────────
router.all('/collect-address', (req, res) => {
  const callSid = req.body.CallSid || 'unknown';
  const lang = req.query.lang || req.body.lang || '3';
  const field = req.query.field || '';
  const serverUrl = getServerUrl(req);

  if (field === 'name' && req.body.RecordingUrl) {
    const session = twilioSessions.get(callSid);
    if (session) {
      session.recordings.name = req.body.RecordingUrl;
    }
  }

  const language = getLanguageFromDTMF(lang);
  const prompts = getPrompts(language.bcp47);

  const xml = twiml(r => {
    r.say(prompts.askAddress);
    r.record({
      action: `${serverUrl}/api/twilio/collect-issue?lang=${lang}&field=address`,
      method: 'POST',
      maxLength: 30,
      timeout: 5,
      finishOnKey: '#',
      playBeep: true
    });
    r.say(prompts.noInput);
    r.redirect(`${serverUrl}/api/twilio/collect-address?lang=${lang}`);
  });

  res.type('application/xml');
  res.send(xml);
});

// ─────────────────────────────────────────────
// Step 5: Collect Issue via Recording
// ─────────────────────────────────────────────
router.all('/collect-issue', (req, res) => {
  const callSid = req.body.CallSid || 'unknown';
  const lang = req.query.lang || '3';
  const field = req.query.field || '';
  const serverUrl = getServerUrl(req);

  if (field === 'address' && req.body.RecordingUrl) {
    const session = twilioSessions.get(callSid);
    if (session) {
      session.recordings.address = req.body.RecordingUrl;
    }
  }

  const language = getLanguageFromDTMF(lang);
  const prompts = getPrompts(language.bcp47);

  const xml = twiml(r => {
    r.say(prompts.askIssue);
    r.record({
      action: `${serverUrl}/api/twilio/process-complaint?lang=${lang}&field=issue`,
      method: 'POST',
      maxLength: 60,
      timeout: 5,
      finishOnKey: '#',
      playBeep: true
    });
    r.say(prompts.noInput);
    r.redirect(`${serverUrl}/api/twilio/collect-issue?lang=${lang}`);
  });

  res.type('application/xml');
  res.send(xml);
});

// ─────────────────────────────────────────────
// Step 6: Process Complaint — Full AI Pipeline
// ─────────────────────────────────────────────
router.all('/process-complaint', async (req, res) => {
  const callSid = req.body.CallSid || req.query.CallSid || 'unknown';
  const lang = req.query.lang || '3';
  const field = req.query.field || '';
  const language = getLanguageFromDTMF(lang);
  const prompts = getPrompts(language.bcp47);

  const session = twilioSessions.get(callSid);
  if (!session) {
    const xml = twiml(r => r.say(prompts.error));
    res.type('application/xml').send(xml);
    return;
  }

  if (field === 'issue' && req.body.RecordingUrl) {
    session.recordings.issue = req.body.RecordingUrl;
  }

  try {
    console.log(`[Twilio] AI processing for ${callSid}...`);

    const transcripts = {};
    for (const [fieldName, recordingUrl] of Object.entries(session.recordings)) {
      try {
        const audioBuffer = await downloadRecording(recordingUrl);
        transcripts[fieldName] = await transcribeAudio(audioBuffer);
      } catch (err) {
        console.warn(`[Twilio] Transcription failed for ${fieldName}:`, err.message);
        transcripts[fieldName] = fieldName === 'name' ? 'Caller' : fieldName === 'address' ? 'Unknown (Twilio)' : 'Voice complaint';
      }
    }

    const rawFields = {
      name: transcripts.name || 'Caller',
      address: transcripts.address || 'Unknown (Twilio)',
      issue: transcripts.issue || 'Voice complaint via Twilio IVR'
    };

    const structured = await structureComplaint(rawFields, language.bcp47);
    const classification = await classifyComplaint(structured);

    if (classification.category === 'Irrelevant') {
      console.warn(`[Twilio Rejection] Irrelevant complaint blocked for ${callSid}`);
      twilioSessions.delete(callSid);
      const xml = twiml(r => r.say("Your description is invalid or irrelevant to civic issues. Please call again and provide a clear description."));
      return res.type('application/xml').send(xml);
    }

    const trackingId = generateTicketId();

    const complaint = await Complaint.create({
      user: null,
      name: structured.name_en,
      location: structured.address_en,
      complaintText: structured.issue_en,
      category: classification.category || 'Other',
      priority: classification.severity === 'Critical' || classification.severity === 'High' ? 'High' : 'Medium',
      summary: classification.summaryEnglish || structured.issue_summary,
      emailDraft: classification.formalEmailDraft,
      trackingId,
      status: 'Pending',
      severity: classification.severity || 'Medium',
      estimatedResolutionDays: classification.estimatedResolutionDays || 1,
      department: classification.department,
      departmentCode: classification.departmentCode || 'GEN',
      callerPhone: session.callerPhone,
      language: language.bcp47,
      rawAudioS3Key: `twilio-recordings/${callSid}.wav`,
      structuredData: structured,
      classificationData: classification,
      verificationScore: 100,
      verificationDecision: 'REAL'
    });

    await appendAuditLog({
      complaintId: complaint._id,
      stageResults: { source: 'twilio', callSid, language: language.bcp47 },
      finalScore: 100,
      decision: 'REAL'
    });

    await sendEmailNotification({ ...complaint.toObject(), emailDraft: classification.formalEmailDraft });
    if (classification.severity === 'Critical') await handleCriticalSeverityCC(complaint);

    twilioSessions.delete(callSid);

    const spokenId = trackingId.split('').join(' ');
    const successMsg = prompts.success(spokenId, classification.department || 'relevant department', classification.estimatedResolutionDays || 1);
    
    const xml = twiml(r => r.say(successMsg));
    res.type('application/xml').send(xml);

  } catch (error) {
    console.error('[Twilio] Pipeline error:', error);
    twilioSessions.delete(callSid);
    const xml = twiml(r => r.say(prompts.error));
    res.type('application/xml').send(xml);
  }
});

// ─────────────────────────────────────────────
// Missed Call Trigger → AI Callback
// User gives missed call → auto-reject → AI calls back
// ─────────────────────────────────────────────
router.all('/missed-call', (req, res) => {
  const callerPhone = req.body.From || req.query.From || '';
  const callSid = req.body.CallSid || req.query.CallSid || 'unknown';
  const serverUrl = getServerUrl(req);

  console.log(`[Missed Call] Incoming from ${callerPhone} (${callSid}) — auto-rejecting & scheduling callback`);

  // Immediately reject the call (caller hears 1 ring then disconnect — FREE for them)
  const xml = twiml(r => {
    r.reject({ reason: 'busy' });
  });
  res.type('application/xml').send(xml);

  // Call them back in 3 seconds with the full IVR complaint flow
  setTimeout(async () => {
    try {
      const { makeOutboundCall } = require('../../ai-services/twilioService');
      const callbackUrl = `${serverUrl}/api/twilio/incoming`;

      console.log(`[Missed Call] Calling back ${callerPhone}...`);
      const call = await makeOutboundCall(callerPhone, callbackUrl);
      console.log(`[Missed Call] Callback initiated: ${call.sid}`);
    } catch (err) {
      console.error(`[Missed Call] Failed to call back ${callerPhone}:`, err.message);
    }
  }, 3000);
});

// ─────────────────────────────────────────────
// Status Callback & Helpers
// ─────────────────────────────────────────────
router.post('/status-callback', (req, res) => {
  console.log(`[Twilio] Call ${req.body.CallSid} status: ${req.body.CallStatus}`);
  res.sendStatus(200);
});

// ─────────────────────────────────────────────
// Web Voice API (Browser Microphone)
// ─────────────────────────────────────────────

// 1. Ingest audio from browser mic and return transcription
router.post('/web-voice-complaint', express.raw({ type: 'application/octet-stream', limit: '15mb' }), async (req, res) => {
  const lang = req.query.lang || 'en-IN';
  const field = req.query.field || 'issue';

  try {
    const audioBuffer = Buffer.from(req.body);
    console.log(`[Web Voice] Received ${field} audio (${audioBuffer.length} bytes, lang=${lang})`);
    
    // Transcribe with Whisper
    const transcript = await transcribeAudio(audioBuffer);
    console.log(`[Web Voice] Transcribed ${field}: "${transcript}"`);
    
    res.json({ success: true, field, transcript });
  } catch (err) {
    console.error(`[Web Voice] Transcription error:`, err.message);
    // Fallback if Whisper fails
    res.json({ success: true, field, transcript: field === 'name' ? 'Citizen' : field === 'address' ? 'Unknown' : 'Voice complaint' });
  }
});

// 2. Submit the transcribed fields for full AI processing
router.post('/web-submit-complaint', express.json(), async (req, res) => {
  const { name, address, issue, lang } = req.body;
  const language = lang || 'en-IN';

  try {
    console.log(`[Web Voice] Processing: name="${name}", address="${address}", issue="${issue}"`);

    const structured = await structureComplaint({ name, address, issue }, language);
    const classification = await classifyComplaint(structured);

    if (classification.category === 'Irrelevant') {
      console.warn(`[Web Voice Rejection] Irrelevant complaint blocked: "${issue}"`);
      return res.status(422).json({ success: false, error: 'invalid description' });
    }

    const trackingId = generateTicketId();

    const complaint = await Complaint.create({
      user: null, // Public user
      name: structured.name_en || name,
      location: structured.address_en || address,
      complaintText: structured.issue_en || issue,
      category: classification.category || 'Other',
      priority: classification.severity === 'Critical' || classification.severity === 'High' ? 'High' : 'Medium',
      summary: classification.summaryEnglish || structured.issue_summary,
      emailDraft: classification.formalEmailDraft,
      trackingId,
      status: 'Pending',
      severity: classification.severity || 'Medium',
      estimatedResolutionDays: classification.estimatedResolutionDays || 1,
      department: classification.department,
      departmentCode: classification.departmentCode || 'GEN',
      callerPhone: 'web-browser',
      language,
      structuredData: structured,
      classificationData: classification,
      verificationScore: 100,
      verificationDecision: 'REAL'
    });

    await appendAuditLog({
      complaintId: complaint._id,
      stageResults: { source: 'web-browser', language },
      finalScore: 100,
      decision: 'REAL'
    });

    try {
      await sendEmailNotification({ ...complaint.toObject(), emailDraft: classification.formalEmailDraft });
    } catch (emailErr) {
      console.error('[Web Voice] Email notification failed, but complaint saved:', emailErr.message);
    }

    if (classification.severity === 'Critical') {
      try {
        await handleCriticalSeverityCC(complaint);
      } catch (ccErr) {
        console.error('[Web Voice] Critical CC reminder failed:', ccErr.message);
      }
    }

    console.log(`[Web Voice] Complaint saved: ${trackingId}`);
    res.json({
      success: true,
      trackingId,
      department: classification.department,
      severity: classification.severity,
      estimatedDays: classification.estimatedResolutionDays || 1,
      category: classification.category || 'Other',
      priority: classification.severity === 'Critical' || classification.severity === 'High' ? 'High' : 'Medium',
      summary: classification.summaryEnglish || req.body.issue
    });
  } catch (err) {
    console.error('[Web Voice] Pipeline error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ─── TTS Proxy for Regional Languages ───
router.get('/tts-proxy', async (req, res) => {
  try {
    const { text, lang } = req.query;
    if (!text || !lang) return res.status(400).json({ error: 'text and lang required' });
    
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('[TTS Proxy] Error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
  }
});

module.exports = router;
