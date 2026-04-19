// ============================================================
// IMAGE FRAUD DETECTION - TEST EXAMPLES
// ============================================================

const { validateImageComplaint } = require('./utils/imageComplaintValidator');

// TEST CASE 1: Legitimate civic issue - pothole with matching image
async function test1_LegitimateComplaint() {
  const result = await validateImageComplaint({
    complaintText: 'Large pothole on Main Street near the traffic light. Many cars getting damaged.',
    imageCaption: 'A large pothole with cracks in the road surface on an urban street',
    photoHash: 'abc123xyz789',
    hasExifData: true
  });

  console.log('TEST 1: Legitimate Complaint');
  console.log(result);
  console.log('Expected: isFraud = false, fraudScore = 0');
  console.log('---\n');
}

// TEST CASE 2: Generic/blank image suspicious
async function test2_GenericImage() {
  const result = await validateImageComplaint({
    complaintText: 'Garbage not collected for days',
    imageCaption: 'A white blank image with no content',
    photoHash: 'def456',
    hasExifData: false
  });

  console.log('TEST 2: Generic/Blank Image');
  console.log(result);
  console.log('Expected: isFraud = true, fraudScore >= 40');
  console.log('---\n');
}

// TEST CASE 3: Stock photo detected
async function test3_StockPhoto() {
  const result = await validateImageComplaint({
    complaintText: 'Water damage at city hall',
    imageCaption: 'Shutterstock image of water pipes with generic illustration',
    photoHash: 'ghi789',
    hasExifData: false
  });

  console.log('TEST 3: Stock Photo');
  console.log(result);
  console.log('Expected: isFraud = true, fraudScore >= 35');
  console.log('---\n');
}

// TEST CASE 4: Mismatched text and image
async function test4_TextImageMismatch() {
  const result = await validateImageComplaint({
    complaintText: 'Pothole damage on Elm Street blocking my car',
    imageCaption: 'A photo of fresh flowers in a garden',
    photoHash: 'jkl012',
    hasExifData: true
  });

  console.log('TEST 4: Text-Image Mismatch');
  console.log(result);
  console.log('Expected: isFraud = true, fraudScore >= 30');
  console.log('---\n');
}

// TEST CASE 5: No civic keywords
async function test5_NoCivicIssue() {
  const result = await validateImageComplaint({
    complaintText: 'Random complaint with no civic issue',
    imageCaption: 'A cat sitting on a chair in an office',
    photoHash: 'mno345',
    hasExifData: true
  });

  console.log('TEST 5: No Civic Issue Keywords');
  console.log(result);
  console.log('Expected: isFraud = true, fraudScore >= 30');
  console.log('---\n');
}

// TEST CASE 6: Real traffic issue with matching image
async function test6_TrafficIssue() {
  const result = await validateImageComplaint({
    complaintText: 'Broken traffic signal at intersection causing accidents',
    imageCaption: 'A traffic light that is not working properly with red wires showing',
    photoHash: 'pqr678',
    hasExifData: true
  });

  console.log('TEST 6: Traffic Issue - Legitimate');
  console.log(result);
  console.log('Expected: isFraud = false, fraudScore = 0');
  console.log('---\n');
}

// RUN ALL TESTS
async function runAllTests() {
  console.log('========================================');
  console.log('IMAGE FRAUD DETECTION TEST SUITE');
  console.log('========================================\n');

  await test1_LegitimateComplaint();
  await test2_GenericImage();
  await test3_StockPhoto();
  await test4_TextImageMismatch();
  await test5_NoCivicIssue();
  await test6_TrafficIssue();

  console.log('========================================');
  console.log('TESTS COMPLETE');
  console.log('========================================');
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };
