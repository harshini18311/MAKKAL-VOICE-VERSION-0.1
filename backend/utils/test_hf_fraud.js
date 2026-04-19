require('dotenv').config({ path: '../.env' });
const { getHfFraudScore } = require('./huggingFraudService');

async function testFraud() {
  const text = "There is a massive pothole in front of my house and it's dangerous.";
  console.log("Testing Hugging Face Fraud Service...");
  const res = await getHfFraudScore(text);
  console.log("Result:", JSON.stringify(res, null, 2));
}

testFraud();
