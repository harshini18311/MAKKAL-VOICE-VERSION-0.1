require('dotenv').config({ path: '../.env' });

async function pingHF() {
  const token = process.env.HF_API_KEY;
  console.log("Using token:", token ? token.substring(0, 10) + "..." : "NONE");
  
  const response = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-mnli', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: "This is a test of the API infrastructure.",
      parameters: { candidate_labels: ["test", "infrastructure"] }
    })
  });

  const status = response.status;
  const text = await response.text();
  console.log("Status:", status);
  console.log("Response:", text);
}

pingHF();
