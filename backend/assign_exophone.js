const axios = require('axios');

const apiKey = 'fc66dac2e3d3a06d7f519d6c2c2a405e596fb825c7e65688';
const apiToken = '4324658b725e1d361103c68f6c5fa0b922c735774f409602';
const sid = 'nil6920';
const number = '08047280205';

const url = `https://api.exotel.com/v1/Accounts/${sid}/IncomingPhoneNumbers/${number}.json?contextId=423142`;

const data = new URLSearchParams();
data.append('VoiceUrl', 'https://henrietta-epiphytic-deidre.ngrok-free.dev/api/exotel/incoming');

axios.put(url, data.toString(), {
  headers: {
    'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded'
  }
})
.then(response => {
  console.log('Success:', response.data);
})
.catch(error => {
  console.error('Error:', error.response ? error.response.data : error.message);
});
