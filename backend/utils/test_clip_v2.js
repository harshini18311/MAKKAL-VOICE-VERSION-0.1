require('dotenv').config({ path: '../.env' });
const { getClipAlignmentScore } = require('./clipVisionService');

async function testPrompts() {
  const complaint = "The street light in front of my house is broken and hanging by a wire.";
  
  // Sample: 1x1 pixel black image
  const buf = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 'base64');

  console.log("Testing original CLIP logic...");
  const res = await getClipAlignmentScore(buf, complaint);
  console.log("Result:", JSON.stringify(res, null, 2));
}

testPrompts();
