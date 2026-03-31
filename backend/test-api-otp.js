const axios = require('axios');

const test = async () => {
  try {
    console.log('Requesting OTP for tnwisesolutions@gmail.com...');
    const res = await axios.post('http://localhost:5000/api/auth/send-otp', {
      contact: 'tnwisesolutions@gmail.com'
    });
    console.log('Response:', res.data);
  } catch (err) {
    console.error('Error sending OTP:', err.response ? err.response.data : err.message);
  }
};

test();
