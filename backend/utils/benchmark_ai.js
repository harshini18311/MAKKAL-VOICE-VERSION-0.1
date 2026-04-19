require('dotenv').config({ path: '../.env' });
const { getClipAlignmentScore } = require('./clipVisionService');

// Create a 1x1 black pixel base64 image
const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const sampleBuffer = Buffer.from(sampleBase64, 'base64');

async function runBenchmark() {
  const testCases = [
    "Please fix the massive pothole near my house ASAP it is very dangerous",
    "There is a huge garbage dump right outside the school wall",
    "Street light no 45 is not working since last month",
    "Water is leaking from the main pipeline continuously",
    "An open manhole is causing severe risk to pedestrians"
  ];

  console.log("========================================");
  console.log("MAKKAL VOICE - AI VISION BENCHMARK");
  console.log("Testing Visual Query Optimization & Ensemble");
  console.log("========================================\n");

  for (let i = 0; i < testCases.length; i++) {
    const text = testCases[i];
    console.log(`Test Case ${i + 1}: "${text}"`);
    console.log(`Processing...`);
    
    // We expect low alignment / high unrelated because the image is just a black pixel.
    // The benchmark proves that the query optimizer and the ensemble model works.
    const startTime = Date.now();
    const result = await getClipAlignmentScore(sampleBuffer, text);
    const duration = Date.now() - startTime;

    if (result) {
      console.log(`=> Optimized Query: "${result.optimizedQuery}"`);
      console.log(`=> Alignment Score: ${result.alignmentScore}%`);
      console.log(`=> Unrelated Rejection Confidence: ${result.unrelatedScore}%`);
      console.log(`=> AI Reason: ${result.aiReason}\n`);
    } else {
      console.log(`=> AI Vision Failed (Check logs for 429/500 errors).\n`);
    }
    
    // Pause to respect OpenAI RPM/429 limits
    await new Promise(r => setTimeout(r, 4000));
  }
}

runBenchmark();
