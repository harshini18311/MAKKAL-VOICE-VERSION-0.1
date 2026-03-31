/**
 * Exotel IVR Routes — ExoML-based webhook endpoints
 *
 * Call flow:
 *   1. /incoming          → Language selection via DTMF <Gather>
 *   2. /language-selected → Redirects to name collection
 *   3. /collect-name      → Records caller's name
 *   4. /collect-address   → Records caller's address
 *   5. /collect-issue     → Records caller's issue/complaint
 *   6. /process-complaint → AI pipeline: transcribe → structure → classify → save → email
 *   7. /status-callback   → Exotel terminal/answered event logger
 *   8. /status            → Health check endpoint
 *
 * Exotel sends HTTP POST with form-encoded data.
 * We respond with ExoML (XML) to control the call.
 */

const express = require('express');
const axios = require('axios');
const Complaint = require('../models/Complaint');
const { transcribeAudio } = require('../../ai-services/speechService');
const { structureComplaint } = require('../../ai-services/aiService');
const { classifyComplaint } = require('../../ai-services/classificationAgent');
const { sendEmailNotification } = require('../../ai-services/emailService');
const { handleCriticalSeverityCC } = require('../services/escalationService');
const { appendAuditLog } = require('../services/auditService');
const { getLanguageFromDTMF, buildLanguageMenuPrompt } = require('../../ai-services/languageRouter');
const { getPrompts } = require('../../ai-services/prompts');

// Exotel <Say> only supports ASCII/English text — Unicode scripts produce silence.
// We always use English prompts for TTS; the caller's chosen language is used only for STT.
const getEnglishPrompts = () => getPrompts('en-IN');

const router = express.Router();

// In-memory store for multi-step IVR sessions
const exotelSessions = new Map();

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
 * Build ExoML XML response string.
 * @param {string} body — inner ExoML elements
 * @returns {string} — complete XML response
 */
function exoml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

// ─────────────────────────────────────────────
// Step 1: Incoming Call → Language Selection
// ─────────────────────────────────────────────
router.all('/incoming', (req, res) => {
  const callSid = (req.body && (req.body.CallSid || req.body.callsid)) || req.query.callSid || req.query.CallSid || 'unknown';
  const callerNumber = (req.body && (req.body.From || req.body.CallFrom)) || req.query.From || req.query.CallFrom || 'unknown';

  console.log(`[Exotel] Incoming call ${callSid} from ${callerNumber}`);

  // Initialize session
  exotelSessions.set(callSid, {
    callerPhone: callerNumber,
    startTime: new Date(),
    language: null,
    recordings: {}
  });

  const serverUrl = getServerUrl(req);
  const menuPrompt = buildLanguageMenuPrompt();
  const prompts = getEnglishPrompts();

  const xml = exoml(`
  <Say>Hello from Antigravity. Testing the Exotel connection. One two three.</Say>
  `);

  res.set('Content-Type', 'application/xml');
  res.send(xml.trim());
});

// ─────────────────────────────────────────────
// Step 2: Language Selected → Start Collection
// ─────────────────────────────────────────────
router.all('/language-selected', (req, res) => {
  const callSid = (req.body && req.body.CallSid) || req.query.callSid || req.query.CallSid || 'unknown';
  const digit = (req.body && (req.body.Digits || req.body.digits)) || req.query.Digits || req.query.digits || '3';

  const language = getLanguageFromDTMF(digit);
  console.log(`[Exotel] Call ${callSid} selected language: ${language.name} (${language.bcp47})`);

  // Update session
  const session = exotelSessions.get(callSid);
  if (session) {
    session.language = language;
  }

  const serverUrl = getServerUrl(req);
  const prompts = getEnglishPrompts();

  const xml = exoml(`
  <Say>${prompts.langSelected}</Say>
  <Redirect>${serverUrl}/api/exotel/collect-name?callSid=${callSid}&amp;lang=${digit}</Redirect>`);

  res.set('Content-Type', 'application/xml');
  res.send(xml.trim());
});

// ─────────────────────────────────────────────
// Step 3: Collect Name via Recording
// ─────────────────────────────────────────────
router.all('/collect-name', (req, res) => {
  const callSid = (req.body && req.body.CallSid) || req.query.callSid || req.query.CallSid || 'unknown';
  const lang = req.query.lang || (req.body && req.body.lang) || '3';
  const serverUrl = getServerUrl(req);
  const language = getLanguageFromDTMF(lang);
  const prompts = getEnglishPrompts();

  console.log(`[Exotel] Collecting name for call ${callSid} in ${language.bcp47}`);

  const xml = exoml(`
  <Say>${prompts.askName}</Say>
  <Record action="${serverUrl}/api/exotel/collect-address?callSid=${callSid}&amp;lang=${lang}&amp;field=name" maxLength="15" timeout="5" finishOnKey="#" playBeep="true" />
  <Say>${prompts.noInput}</Say>
  <Redirect>${serverUrl}/api/exotel/collect-name?callSid=${callSid}&amp;lang=${lang}</Redirect>`);

  res.set('Content-Type', 'application/xml');
  res.send(xml.trim());
});

// ─────────────────────────────────────────────
// Step 4: Collect Address via Recording
// ─────────────────────────────────────────────
router.all('/collect-address', (req, res) => {
  const callSid = (req.body && req.body.CallSid) || req.query.callSid || req.query.CallSid || 'unknown';
  const lang = req.query.lang || (req.body && req.body.lang) || '3';
  const field = req.query.field || '';
  const serverUrl = getServerUrl(req);

  if (field === 'name' && ((req.body && req.body.RecordingUrl) || req.query.RecordingUrl)) {
    const recordingUrl = (req.body && req.body.RecordingUrl) || req.query.RecordingUrl;
    const session = exotelSessions.get(callSid);
    if (session) {
      session.recordings.name = recordingUrl;
      console.log(`[Exotel] Name recording saved for ${callSid}: ${recordingUrl}`);
    }
  }

  const language = getLanguageFromDTMF(lang);
  const prompts = getEnglishPrompts();

  const xml = exoml(`
  <Say>${prompts.askAddress}</Say>
  <Record action="${serverUrl}/api/exotel/collect-issue?callSid=${callSid}&amp;lang=${lang}&amp;field=address" maxLength="30" timeout="5" finishOnKey="#" playBeep="true" />
  <Say>${prompts.noInput}</Say>
  <Redirect>${serverUrl}/api/exotel/collect-address?callSid=${callSid}&amp;lang=${lang}</Redirect>`);

  res.set('Content-Type', 'application/xml');
  res.send(xml.trim());
});

// ─────────────────────────────────────────────
// Step 5: Collect Issue via Recording
// ─────────────────────────────────────────────
router.all('/collect-issue', (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid || 'unknown';
  const lang = req.query.lang || '3';
  const field = req.query.field || '';
  const serverUrl = getServerUrl(req);

  if (field === 'address' && ((req.body && req.body.RecordingUrl) || req.query.RecordingUrl)) {
    const recordingUrl = (req.body && req.body.RecordingUrl) || req.query.RecordingUrl;
    const session = exotelSessions.get(callSid);
    if (session) {
      session.recordings.address = recordingUrl;
      console.log(`[Exotel] Address recording saved for ${callSid}: ${recordingUrl}`);
    }
  }

  const language = getLanguageFromDTMF(lang);
  const prompts = getEnglishPrompts();

  const xml = exoml(`
  <Say>${prompts.askIssue}</Say>
  <Record action="${serverUrl}/api/exotel/process-complaint?callSid=${callSid}&amp;lang=${lang}&amp;field=issue" maxLength="60" timeout="5" finishOnKey="#" playBeep="true" />
  <Say>${prompts.noInput}</Say>
  <Redirect>${serverUrl}/api/exotel/collect-issue?callSid=${callSid}&amp;lang=${lang}</Redirect>`);

  res.set('Content-Type', 'application/xml');
  res.send(xml.trim());
});

// ─────────────────────────────────────────────
// Step 6: Process Complaint — Full AI Pipeline
// ─────────────────────────────────────────────
router.all('/process-complaint', async (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid || 'unknown';
  const lang = req.query.lang || '3';
  const field = req.query.field || '';
  const language = getLanguageFromDTMF(lang);
  const prompts = getEnglishPrompts();

  const session = exotelSessions.get(callSid);
  if (!session) {
    console.error(`[Exotel] No session found for call ${callSid}`);
    const xml = exoml(`<Say>${prompts.error}</Say>`);
    res.set('Content-Type', 'application/xml');
    return res.send(xml.trim());
  }

  // Save issue recording URL
  if (field === 'issue' && req.body.RecordingUrl) {
    session.recordings.issue = req.body.RecordingUrl;
    console.log(`[Exotel] Issue recording saved for ${callSid}: ${req.body.RecordingUrl}`);
  }

  try {
    console.log(`[Exotel] Processing complaint for call ${callSid}...`);
    console.log(`[Exotel] Recordings:`, JSON.stringify(session.recordings));

    // ── Step 1: Transcribe all recordings ──
    const transcripts = {};
    for (const [fieldName, recordingUrl] of Object.entries(session.recordings)) {
      try {
        const audioBuffer = await downloadRecording(recordingUrl);
        transcripts[fieldName] = await transcribeAudio(audioBuffer);
        console.log(`[Exotel] Transcribed ${fieldName}: ${transcripts[fieldName]}`);
      } catch (err) {
        console.warn(`[Exotel] Transcription failed for ${fieldName}:`, err.message);
        transcripts[fieldName] = fieldName === 'name' ? 'Caller' : fieldName === 'address' ? 'Unknown (via Exotel)' : 'Voice complaint';
      }
    }

    const rawFields = {
      name: transcripts.name || 'Caller',
      address: transcripts.address || 'Unknown (via Exotel Call)',
      issue: transcripts.issue || 'Voice complaint via Exotel IVR'
    };

    console.log(`[Exotel] Raw fields for ${callSid}:`, rawFields);

    // ── Step 2: Structure complaint with LLM ──
    const structured = await structureComplaint(rawFields, language.bcp47);
    console.log(`[Exotel] Structured data:`, JSON.stringify(structured));

    // ── Step 3: Classify complaint ──
    const classification = await classifyComplaint(structured);
    console.log(`[Exotel] Classification:`, JSON.stringify(classification));

    if (classification.category === 'Irrelevant') {
      console.warn(`[Exotel Rejection] Irrelevant complaint blocked for ${callSid}`);
      exotelSessions.delete(callSid);
      const xml = exoml(`<Say>Your description is invalid or irrelevant to civic issues. Please call again and provide a clear description.</Say>`);
      res.set('Content-Type', 'application/xml');
      return res.send(xml.trim());
    }

    // ── Step 4: Generate ticket ID ──
    const trackingId = generateTicketId();

    // ── Step 5: Save to database ──
    const complaint = await Complaint.create({
      user: null,
      name: structured.name_en,
      location: structured.address_en,
      complaintText: structured.issue_en,
      category: classification.category || 'Other',
      priority: classification.severity === 'Critical' || classification.severity === 'High' ? 'High' : classification.severity === 'Low' ? 'Low' : 'Medium',
      summary: classification.summaryEnglish || structured.issue_summary,
      emailDraft: classification.formalEmailDraft,
      trackingId,
      status: 'Pending',
      severity: classification.severity || 'Medium',
      estimatedResolutionDays: classification.estimatedResolutionDays || 7,
      department: classification.department,
      departmentCode: classification.departmentCode || 'GEN',
      callerPhone: session.callerPhone,
      language: language.bcp47,
      rawAudioS3Key: `exotel-recordings/${callSid}/${new Date().toISOString().split('T')[0]}.wav`,
      structuredData: structured,
      classificationData: classification,
      verificationScore: 100,
      verificationDecision: 'REAL'
    });

    // ── Step 6: Audit trail ──
    await appendAuditLog({
      complaintId: complaint._id,
      stageResults: {
        source: 'exotel',
        callSid,
        language: language.bcp47,
        fieldsCollected: Object.keys(rawFields).length,
        structuringMethod: 'llm',
        classificationMethod: classification.department ? 'llm' : 'heuristic'
      },
      finalScore: 100,
      decision: 'REAL',
      entries: [
        { stage: 1, name: 'exotel_intake', flags: [], partialScore: 100 },
        { stage: 2, name: 'stt_transcription', flags: [], partialScore: 100 },
        { stage: 3, name: 'llm_structuring', flags: [], partialScore: 100 },
        { stage: 4, name: 'classification', flags: [], partialScore: 100 }
      ]
    });

    // ── Step 7: Email notification to department ──
    await sendEmailNotification({
      ...complaint.toObject(),
      emailDraft: classification.formalEmailDraft
    });

    // ── Step 8: Supervisor CC for Critical ──
    if (classification.severity === 'Critical') {
      await handleCriticalSeverityCC(complaint);
    }

    // ── Cleanup session ──
    exotelSessions.delete(callSid);

    console.log(`✅ [Exotel] Complaint ${trackingId} created for ${session.callerPhone} — ${classification.category} (${classification.severity})`);

    // ── Respond to caller with tracking ID ──
    const spokenId = trackingId.split('').join(' ');
    const successMsg = prompts.success(spokenId, classification.department || 'relevant department', classification.estimatedResolutionDays || 7);
    const xml = exoml(`<Say>${successMsg}</Say>`);

    res.set('Content-Type', 'application/xml');
    res.send(xml.trim());

  } catch (error) {
    console.error('[Exotel] Processing error:', error);

    // Cleanup on error
    exotelSessions.delete(callSid);

    const xml = exoml(`<Say>${prompts.error}</Say>`);

    res.set('Content-Type', 'application/xml');
    res.send(xml.trim());
  }
});

// ─────────────────────────────────────────────
// Status Callback (terminal/answered events)
// ─────────────────────────────────────────────
router.post('/status-callback', (req, res) => {
  const callSid = req.body.CallSid || req.body.callsid || 'unknown';
  const status = req.body.Status || req.body.status || 'unknown';
  const direction = req.body.Direction || req.body.direction || 'unknown';

  console.log(`[Exotel] Status callback — Call: ${callSid}, Status: ${status}, Direction: ${direction}`);

  if (req.body.RecordingUrl) {
    console.log(`[Exotel] Recording URL: ${req.body.RecordingUrl}`);
  }

  res.status(200).json({ ok: true });
});

// ─────────────────────────────────────────────
// Make Outbound Call (test endpoint)
// ─────────────────────────────────────────────
router.post('/make-call', async (req, res) => {
  try {
    const { makeOutboundCall } = require('../../ai-services/exotelService');
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    const serverUrl = getServerUrl(req);
    const callbackUrl = `${serverUrl}/api/exotel/incoming`;

    const result = await makeOutboundCall(phoneNumber, callbackUrl);
    console.log(`[Exotel] Outbound call initiated:`, JSON.stringify(result));

    res.json({
      success: true,
      message: `Call initiated to ${phoneNumber}. The IVR will start when the caller picks up.`,
      data: result
    });
  } catch (error) {
    console.error('[Exotel] Make call error:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data || error.message,
      hint: 'Make sure EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_ACCOUNT_SID, and EXOTEL_EXOPHONE are set in .env'
    });
  }
});

// ─────────────────────────────────────────────
// Health Check / Status
// ─────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const hasApiKey = !!process.env.EXOTEL_API_KEY;
  const hasApiToken = !!process.env.EXOTEL_API_TOKEN;
  const hasSid = !!process.env.EXOTEL_ACCOUNT_SID;
  const hasExophone = !!process.env.EXOTEL_EXOPHONE;

  if (!hasApiKey || !hasApiToken || !hasSid) {
    return res.json({
      status: 'not_configured',
      message: 'Exotel credentials not set in .env',
      configured: { apiKey: hasApiKey, apiToken: hasApiToken, accountSid: hasSid, exophone: hasExophone },
      setupSteps: [
        '1. Sign up at https://exotel.com',
        '2. Get your API Key, API Token, and Account SID from https://my.exotel.com/apisettings',
        '3. Add EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_ACCOUNT_SID, EXOTEL_EXOPHONE to backend/.env',
        '4. Run ngrok: ngrok http 5000',
        '5. Set your Exophone incoming call URL to: https://<ngrok-url>/api/exotel/incoming',
        '6. Restart the server'
      ]
    });
  }

  // Validate credentials if all present
  let credentialsValid = false;
  try {
    const { validateCredentials } = require('../../ai-services/exotelService');
    credentialsValid = await validateCredentials();
  } catch (err) {
    console.warn('[Exotel] Status check error:', err.message);
  }

  const serverUrl = getServerUrl(req);

  res.json({
    status: credentialsValid ? 'configured' : 'credentials_invalid',
    credentialsValid,
    exophone: process.env.EXOTEL_EXOPHONE,
    webhookUrl: `${serverUrl}/api/exotel/incoming`,
    activeSessions: exotelSessions.size,
    endpoints: {
      incoming: `${serverUrl}/api/exotel/incoming`,
      statusCallback: `${serverUrl}/api/exotel/status-callback`,
      makeCall: `${serverUrl}/api/exotel/make-call`
    }
  });
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Get the server's public URL from request headers or env.
 */
function getServerUrl(req) {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/**
 * Download recording audio from Exotel URL.
 * @param {string} url — Exotel recording URL
 * @returns {Promise<Buffer>}
 */
async function downloadRecording(url) {
  const config = {};

  // Exotel recordings may require auth
  if (process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN) {
    config.auth = {
      username: process.env.EXOTEL_API_KEY,
      password: process.env.EXOTEL_API_TOKEN
    };
  }

  const response = await axios.get(url, {
    ...config,
    responseType: 'arraybuffer',
    timeout: 30000
  });

  return Buffer.from(response.data);
}

module.exports = router;
module.exports.exotelSessions = exotelSessions;
