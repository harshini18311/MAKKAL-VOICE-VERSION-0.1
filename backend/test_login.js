const axios = require('axios');

async function testLogin() {
  try {
    console.log('Testing Admin Login...');
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issue',
      password: 'admin@123'
    });
    console.log('Admin Login Success:', response.data);
  } catch (error) {
    console.log('Admin Login Failed:', error.response?.status, error.response?.data);
  }

  try {
    console.log('Testing Root...');
    const response = await axios.get('http://localhost:5000/');
    console.log('Root Success:', response.data);
  } catch (error) {
    console.log('Root Failed:', error.response?.status);
  }
}

testLogin();
