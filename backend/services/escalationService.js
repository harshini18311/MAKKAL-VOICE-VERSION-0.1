/**
 * Escalation Service — handles retry-failure handoffs, supervisor CC,
 * and daily digest emails for unresolved tickets > 48 hours.
 */

const Complaint = require('../models/Complaint');
const { sendEmailNotification } = require('../../ai-services/emailService');

const SUPERVISOR_EMAIL = process.env.SUPERVISOR_EMAIL || 'supervisor@tn.gov.in';
const DIGEST_RECIPIENT = process.env.DIGEST_RECIPIENT || 'admin@tn.gov.in';

/**
 * Build TwiML for human agent handoff (called when field collection retries are exhausted).
 * @param {string} reason — why the handoff is happening
 * @returns {string} — TwiML XML string
 */
function buildAgentHandoffTwiML(reason = 'Unable to process voice input') {
  const agentQueue = process.env.HUMAN_AGENT_QUEUE || 'complaint-support';
  return `
    <Response>
      <Say voice="Polly.Aditi" language="en-IN">
        We are connecting you to a support agent. Please hold while we transfer your call.
      </Say>
      <Enqueue workflowSid="${process.env.TWILIO_WORKFLOW_SID || ''}">
        ${agentQueue}
      </Enqueue>
      <Say voice="Polly.Aditi" language="en-IN">
        We are sorry, all agents are currently busy. Your concern has been noted and someone will call you back shortly. Goodbye.
      </Say>
    </Response>
  `;
}

/**
 * Send supervisor CC for Critical severity complaints.
 * @param {object} complaint — Mongoose complaint document
 */
async function handleCriticalSeverityCC(complaint) {
  if (complaint.severity !== 'Critical') return;

  try {
    const supervisorSubject = `🚨 CRITICAL COMPLAINT: ${complaint.category} - ${complaint.trackingId}`;
    const supervisorBody = `
CRITICAL SEVERITY COMPLAINT ALERT
===================================
Tracking ID: ${complaint.trackingId}
Category: ${complaint.category}
Department: ${complaint.department || complaint.departmentCode || 'Unknown'}
Severity: CRITICAL
Filed at: ${complaint.createdAt ? new Date(complaint.createdAt).toISOString() : new Date().toISOString()}

Complainant: ${complaint.name || 'Anonymous'}
Location: ${complaint.location || 'Unknown'}

Summary: ${complaint.summary || ''}

Email Draft:
${complaint.emailDraft || 'N/A'}
===================================
This complaint requires IMMEDIATE attention. It has been automatically flagged for supervisor review.
    `.trim();

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`\n[Escalation] ⚠️ CRITICAL SEVERITY CC (Mock)`);
      console.log(`To: ${SUPERVISOR_EMAIL}`);
      console.log(`Subject: ${supervisorSubject}`);
      console.log(`Body: ${supervisorBody.substring(0, 200)}...`);
      return { success: true, mock: true };
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS?.replace(/\s/g, '')
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: SUPERVISOR_EMAIL,
      subject: supervisorSubject,
      text: supervisorBody
    });

    console.log(`✅ Supervisor CC sent for Critical complaint ${complaint.trackingId}`);
    return { success: true, mock: false };
  } catch (error) {
    console.error(`❌ Supervisor CC failed for ${complaint.trackingId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Query unresolved tickets older than 48 hours.
 * @returns {Promise<Array>} — list of stale complaints
 */
async function getUnresolvedTickets48h() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  return Complaint.find({
    status: { $in: ['Pending', 'QueuedReview'] },
    createdAt: { $lte: cutoff }
  })
    .select('trackingId category severity name location summary status createdAt departmentCode')
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
}

/**
 * Build daily digest email body for unresolved tickets.
 * @param {Array} tickets — unresolved complaint documents
 * @returns {{ subject: string, body: string }}
 */
function buildDigestEmail(tickets) {
  const now = new Date().toISOString().split('T')[0];

  if (tickets.length === 0) {
    return {
      subject: `[MAKKAL VOICE] Daily Digest — ${now} — ✅ No unresolved tickets`,
      body: 'All complaints filed more than 48 hours ago have been resolved. Great work!'
    };
  }

  const criticalCount = tickets.filter(t => t.severity === 'Critical').length;
  const highCount = tickets.filter(t => t.severity === 'High').length;

  const rows = tickets.map((t, i) => {
    const age = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 3600000);
    return `${i + 1}. [${t.trackingId}] ${t.category} (${t.severity || 'Medium'}) — ${t.name || 'Anon'} @ ${t.location || 'Unknown'} — ${age}h ago — ${t.status}`;
  }).join('\n');

  return {
    subject: `[MAKKAL VOICE] Daily Digest — ${now} — ${tickets.length} unresolved (${criticalCount} Critical, ${highCount} High)`,
    body: `UNRESOLVED COMPLAINTS — OLDER THAN 48 HOURS
=============================================
Date: ${now}
Total: ${tickets.length} tickets
Critical: ${criticalCount}
High: ${highCount}

TICKET LIST:
${rows}

=============================================
Please take action on these tickets as soon as possible.
Tickets with Critical severity require immediate attention.`
  };
}

/**
 * Send the daily digest email.
 */
async function sendDailyDigestEmail() {
  try {
    const tickets = await getUnresolvedTickets48h();
    const { subject, body } = buildDigestEmail(tickets);

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`\n[Daily Digest] Mock Email`);
      console.log(`To: ${DIGEST_RECIPIENT}`);
      console.log(`Subject: ${subject}`);
      console.log(`Unresolved tickets: ${tickets.length}`);
      return { success: true, mock: true, ticketCount: tickets.length };
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS?.replace(/\s/g, '')
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: DIGEST_RECIPIENT,
      subject,
      text: body
    });

    console.log(`✅ Daily digest sent: ${tickets.length} unresolved tickets`);
    return { success: true, mock: false, ticketCount: tickets.length };
  } catch (error) {
    console.error('❌ Daily digest email failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Start the daily digest interval (call once on server startup).
 * Runs every 24 hours.
 */
function startDailyDigestScheduler() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Run first digest 1 minute after startup (for verification)
  setTimeout(async () => {
    console.log('[Escalation] Running initial digest check...');
    await sendDailyDigestEmail();
  }, 60 * 1000);

  // Then run every 24 hours
  setInterval(async () => {
    console.log('[Escalation] Running scheduled daily digest...');
    await sendDailyDigestEmail();
  }, INTERVAL_MS);

  console.log('[Escalation] Daily digest scheduler started (every 24h)');
}

module.exports = {
  buildAgentHandoffTwiML,
  handleCriticalSeverityCC,
  getUnresolvedTickets48h,
  buildDigestEmail,
  sendDailyDigestEmail,
  startDailyDigestScheduler
};
