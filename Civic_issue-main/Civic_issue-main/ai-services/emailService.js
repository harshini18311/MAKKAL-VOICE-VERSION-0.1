const nodemailer = require('nodemailer');

function createSmtpTransport() {
  const allowSelfSigned = (process.env.SMTP_ALLOW_SELF_SIGNED || '').toLowerCase() === 'true';

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s/g, '')
    },
    // Useful in corporate/proxied networks that re-sign certificates.
    ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {})
  });
}

async function sendEmailNotification(complaint) {
  try {
    const departmentEmails = {
      'Water': 'cmwssb@tn.gov.in',
      'Road': 'complaints@chennaicorporation.gov.in',
      'Electricity': 'tangedco@tnebnet.org',
      'Sanitation': 'complaints@chennaicorporation.gov.in',
      'Traffic': 'traffic@chennaipolice.gov.in',
      'Public Safety': 'traffic@chennaipolice.gov.in',
      'Rural specific': 'rd@tn.gov.in',
      'Infrastructure': 'rd@tn.gov.in',
      'Government Services': 'rd@tn.gov.in',
      'Other': 'complaints@tn.gov.in'
    };

    const recipient = departmentEmails[complaint.category] || departmentEmails['Other'];

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`\n---------------------------------`);
      console.log(`[Email Mock Dispatch]`);
      console.log(`To: ${recipient}`);
      console.log(`Subject: OFFICIAL COMPLAINT: ${complaint.category} Issue - ${complaint.trackingId}`);
      console.log(`Draft Content: \n${complaint.emailDraft || 'Summary: ' + complaint.summary}`);
      console.log(`---------------------------------\n`);
      return;
    }

    const transporter = createSmtpTransport();

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: recipient,
      subject: `OFFICIAL COMPLAINT: ${complaint.category} Issue - Tracking ID: ${complaint.trackingId}`,
      text: complaint.emailDraft || `AI Summary: ${complaint.summary}\n\nOriginal Complaint: ${complaint.complaintText}`,
      html: complaint.emailDraft ? 
        `<div style="font-family: serif; white-space: pre-wrap; font-size: 1.1rem; border: 1px solid #ccc; padding: 2rem;">${complaint.emailDraft.replace(/\n/g, '<br/>')}</div>` : 
        `<h2>New Complaint Registered</h2><p>${complaint.summary}</p>`
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Official Email Sent to ${recipient} for ${complaint.trackingId}`);
  } catch (error) {
    console.error(`❌ Email Notification Failed for ${complaint.trackingId}:`);
    console.error(`ERROR: ${error.message}`);
    if (error.message.includes('Invalid login')) {
      console.error('TIP: If using Gmail, you MUST use an "App Password", not your regular password.');
    }
  }
}

async function sendOTPEmail(email, otp) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[Email Mock OTP] To: ${email} | OTP: ${otp}`);
      return { ok: true, mocked: true };
    }

    const transporter = createSmtpTransport();

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: `VERIFICATION CODE: ${otp} - CivicVoice AI`,
      text: `Your 4-digit verification code is: ${otp}\n\nPlease use this code to complete your registration in the CivicVoice AI Rural Complaint System.`,
      html: `
        <div style="font-family: sans-serif; text-align: center; padding: 2rem; border: 1px solid #eee;">
          <h2>Registration Verification</h2>
          <p>Your 4-digit verification code is:</p>
          <h1 style="font-size: 3rem; color: #4f46e5; letter-spacing: 0.5rem;">${otp}</h1>
          <p>Please use this code to complete your registration.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP Email Sent to ${email}`);
    return { ok: true, mocked: false };
  } catch (error) {
    console.error(`❌ OTP Email Failed for ${email}:`, error.message);
    return { ok: false, error: `Unable to send OTP email: ${error.message}` };
  }
}

module.exports = { sendEmailNotification, sendOTPEmail };
