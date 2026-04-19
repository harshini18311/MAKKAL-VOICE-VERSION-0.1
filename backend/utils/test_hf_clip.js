require('dotenv').config({ path: '../.env' });
const fs = require('fs');

async function testClip() {
  const token = process.env.HF_API_KEY;
  if (!token) {
    console.error('No HF API KEY');
    return;
  }
  
  try {
    const textBlob = "A pothole on a paved road";
    // Using a sample base64 string or image buffer
    // create a 1x1 black pixel base64 image
    const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    
    // We can also try fetch on the API
    const res = await fetch('https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: sampleBase64,
        parameters: {
          candidate_labels: [textBlob, 'unrelated random objects', 'a beautiful scenery']
        }
      })
    });
    
    const result = await res.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}

testClip();
