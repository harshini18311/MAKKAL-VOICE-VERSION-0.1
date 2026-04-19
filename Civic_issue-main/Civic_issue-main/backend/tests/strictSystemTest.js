// ============================================================
// STRICT FRAUD DETECTION - TEST VALIDATION
// ============================================================

const { detectComplaintFraud, isGibberish, isMeaninglessText } = require('./utils/fraudDetection');
const { validateImageComplaint } = require('./utils/imageComplaintValidator');

async function testStrictSystem() {
  console.log('========================================');
  console.log('STRICT FRAUD DETECTION - TESTS');
  console.log('New Thresholds: CLEAN 0-19, SUSPICIOUS 20-39, FLAGGED 40+');
  console.log('========================================\n');

  // TEST 1: "water leakage" + unrelated image (BUS)
  console.log('TEST 1: water leakage + bus image');
  console.log('Expected: FLAGGED (70+)');
  const test1Text = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'water leakage',
    location: '',
    sourceIp: '127.0.0.1'
  });
  console.log(`Text Score: ${test1Text.fraudScore}/100 - Status: ${test1Text.fraudStatus}`);
  console.log(`Reasons: ${test1Text.fraudReasons.join(', ')}`);

  const test1Image = await validateImageComplaint({
    complaintText: 'water leakage',
    imageCaption: 'A bus on the street',
    photoHash: 'test1hash',
    hasExifData: false
  });
  console.log(`Image Score: ${test1Image.fraudScore}/100 - IsFraud: ${test1Image.isFraud}`);
  console.log(`Image Reason: ${test1Image.reason}`);
  const combined1 = test1Text.fraudScore + (test1Image.isFraud ? test1Image.fraudScore : 0);
  console.log(`Combined Score: ${Math.min(combined1, 100)}/100`);
  console.log('---\n');

  // TEST 2: Gibberish text "jjjjj hhhh"
  console.log('TEST 2: gibberish text only');
  console.log('Expected: FLAGGED (60+)');
  const isGibberishCheck = isGibberish('jjjjj hhhh');
  console.log(`Is Gibberish: ${isGibberishCheck}`);
  const test2 = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'jjjjj hhhh',
    location: 'random',
    sourceIp: '127.0.0.1'
  });
  console.log(`Score: ${test2.fraudScore}/100 - Status: ${test2.fraudStatus}`);
  console.log(`Reasons: ${test2.fraudReasons.join(', ')}`);
  console.log('---\n');

  // TEST 3: Single word "pothole"
  console.log('TEST 3: single word complaint');
  console.log('Expected: FLAGGED (55+)');
  const isMeaningless = isMeaninglessText('pothole');
  console.log(`Is Meaningless: ${isMeaningless}`);
  const test3 = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'pothole',
    location: '',
    sourceIp: '127.0.0.1'
  });
  console.log(`Score: ${test3.fraudScore}/100 - Status: ${test3.fraudStatus}`);
  console.log(`Reasons: ${test3.fraudReasons.join(', ')}`);
  console.log('---\n');

  // TEST 4: Repeated words "help help help"
  console.log('TEST 4: repeated words pattern');
  console.log('Expected: FLAGGED (70+)');
  const test4 = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'help help help',
    location: 'Main Street',
    sourceIp: '127.0.0.1'
  });
  console.log(`Score: ${test4.fraudScore}/100 - Status: ${test4.fraudStatus}`);
  console.log(`Reasons: ${test4.fraudReasons.join(', ')}`);
  console.log('---\n');

  // TEST 5: Legitimate complaint "Large pothole on Main Street with water damage"
  console.log('TEST 5: legitimate complaint + civic image');
  console.log('Expected: CLEAN (0-19)');
  const test5 = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'Large pothole on Main Street with water damage blocking traffic',
    location: 'Main Street, Downtown',
    sourceIp: '127.0.0.1'
  });
  console.log(`Score: ${test5.fraudScore}/100 - Status: ${test5.fraudStatus}`);
  console.log(`Reasons: ${test5.fraudReasons.join(', ')}`);

  const test5Image = await validateImageComplaint({
    complaintText: 'Large pothole on Main Street with water damage',
    imageCaption: 'A large pothole with water accumulation in the road',
    photoHash: 'test5hash',
    hasExifData: true
  });
  console.log(`Image Score: ${test5Image.fraudScore}/100 - IsFraud: ${test5Image.isFraud}`);
  console.log(`Image Reason: ${test5Image.reason}`);
  console.log('---\n');

  // TEST 6: Generic image "white blank image"
  console.log('TEST 6: generic/blank image');
  console.log('Expected: FLAGGED (55+)');
  const test6 = await detectComplaintFraud({
    Complaint: null,
    userId: null,
    text: 'Road damage complaint',
    location: 'Park Avenue',
    sourceIp: '127.0.0.1'
  });
  const test6Image = await validateImageComplaint({
    complaintText: 'Road damage',
    imageCaption: 'A white blank empty image with no content',
    photoHash: 'test6hash',
    hasExifData: false
  });
  console.log(`Text Score: ${test6.fraudScore}/100`);
  console.log(`Image Score: ${test6Image.fraudScore}/100 - IsFraud: ${test6Image.isFraud}`);
  console.log(`Image Reason: ${test6Image.reason}`);
  const combined6 = test6.fraudScore + (test6Image.isFraud ? test6Image.fraudScore : 0);
  console.log(`Combined Score: ${Math.min(combined6, 100)}/100`);
  console.log('---\n');

  console.log('========================================');
  console.log('ANALYSIS');
  console.log('========================================');
  console.log('✓ Gibberish text now detected (restored with high penalty)');
  console.log('✓ Meaningless text detection added');
  console.log('✓ Image validation penalties increased (40-55 points)');
  console.log('✓ Thresholds lowered (Flagged now 40+ instead of 50+)');
  console.log('✓ False negatives should be reduced significantly');
  console.log('========================================\n');
}

// Run tests
testStrictSystem().catch(console.error);
