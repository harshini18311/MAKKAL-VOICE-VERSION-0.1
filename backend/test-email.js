require('dotenv').config();
const { sendOTPEmail } = require('../ai-services/emailService');

const testEmail = 'tnwisesolutions@gmail.com'; // Testing with a known email
const testOtp = '9999';

console.log('Starting OTP email test...');
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS is set:', !!process.env.SMTP_PASS);

sendOTPEmail(testEmail, testOtp)
  .then(() => {
    console.log('SUCCESS: OTP Email sent successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILURE: OTP Email failed to send.');
    console.error('Error details:', err);
    process.exit(1);
  });
