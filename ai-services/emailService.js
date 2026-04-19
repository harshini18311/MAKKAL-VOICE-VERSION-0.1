const nodemailer = require('nodemailer');

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
      return { success: true, recipient, mock: true };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // upgrades to STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS?.replace(/\s/g, '')
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const attachments = [];
    let htmlContent = complaint.emailDraft ? 
      `<div style="font-family: serif; white-space: pre-wrap; font-size: 1.1rem; border: 1px solid #ccc; padding: 2rem;">${complaint.emailDraft.replace(/\n/g, '<br/>')}</div>` : 
      `<h2>New Complaint Registered</h2><p>${complaint.summary}</p>`;

    if (complaint.image) {
      const base64Data = complaint.image.split('base64,').pop();
      attachments.push({
        filename: `evidence-${complaint.trackingId}.jpg`,
        content: base64Data,
        encoding: 'base64',
        cid: 'evidenceImage'
      });
      htmlContent += `<br/><br/><div style="padding: 1rem; border-top: 1px solid #ddd;">
        <h3 style="color: #4f46e5; margin-bottom: 1rem;">Citizen's Original Evidence:</h3>
        <img src="cid:evidenceImage" style="max-width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid #ccc;" alt="Complaint Evidence" />
      </div>`;
    }

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: recipient,
      subject: `OFFICIAL COMPLAINT: ${complaint.category} Issue - Tracking ID: ${complaint.trackingId}`,
      text: complaint.emailDraft || `AI Summary: ${complaint.summary}\n\nOriginal Complaint: ${complaint.complaintText}`,
      html: htmlContent,
      attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Official Email Sent to ${recipient} for ${complaint.trackingId}`);
    return { success: true, recipient, mock: false };
  } catch (error) {
    console.error(`❌ Email Notification Failed for ${complaint.trackingId}:`);
    console.error(`ERROR: ${error.message}`);
    if (error.message.includes('Invalid login')) {
      console.error('TIP: If using Gmail, you MUST use an "App Password", not your regular password.');
    }
    return { success: false, recipient: departmentEmails[complaint.category] || departmentEmails['Other'], error: error.message };
  }
}

async function sendOTPEmail(email, otp) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[Email Mock OTP] To: ${email} | OTP: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS?.replace(/\s/g, '')
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: `VERIFICATION CODE: ${otp} - MAKKAL VOICE`,
      text: `Your 4-digit verification code is: ${otp}\n\nPlease use this code to complete your registration in the MAKKAL VOICE Rural Complaint System.`,
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
  } catch (error) {
    console.error(`❌ OTP Email Failed for ${email}:`, error.message);
    throw error;
  }
}

module.exports = { sendEmailNotification, sendOTPEmail };

/**
 * Send SMS confirmation to caller (via Twilio or mock).
 * @param {string} phone — caller phone number
 * @param {object} complaint — complaint data with trackingId, category, severity
 * @param {string} smsGreeting — localized greeting from language router
 */
async function sendSMSConfirmation(phone, complaint, smsGreeting = 'Hello') {
  const message = `${smsGreeting}! Your complaint (${complaint.trackingId}) has been registered. Category: ${complaint.category}. Severity: ${complaint.severity || 'Medium'}. Est. resolution: ${complaint.estimatedResolutionDays || 7} days. Track at: civicvoice.tn.gov.in/track/${complaint.trackingId}`;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[SMS Mock] To: ${phone} | Message: ${message}`);
    return { success: true, mock: true };
  }

  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log(`✅ SMS sent to ${phone}`);
    return { success: true, mock: false };
  } catch (error) {
    console.error(`❌ SMS failed for ${phone}:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports.sendSMSConfirmation = sendSMSConfirmation;

