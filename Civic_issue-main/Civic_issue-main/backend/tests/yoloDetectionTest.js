// ============================================================
// OBJECT DETECTION FRAUD TEST
// YOLO v8 + Complaint Text Matching
// ============================================================

const { validateImageComplaint, matchObjectsToComplaint } = require('./utils/imageComplaintValidator');

async function testObjectDetection() {
  console.log('========================================');
  console.log('YOLO v8 OBJECT DETECTION TESTS');
  console.log('========================================\n');

  // TEST 1: Bus detected in "water leakage" complaint
  console.log('TEST 1: Bus image + water leakage complaint');
  console.log('Expected: FLAGGED (70+) - object mismatch');
  
  const busObject = [
    { object: 'bus', confidence: 0.95 },
    { object: 'street', confidence: 0.87 }
  ];
  
  const objectMatch1 = matchObjectsToComplaint(busObject, 'water leakage');
  console.log(`Object Match: ${objectMatch1.matched}/${objectMatch1.total} (${objectMatch1.alignment}%)`);
  
  const test1 = await validateImageComplaint({
    complaintText: 'water leakage',
    imageCaption: 'A bus on the street',
    detectedObjects: busObject,
    photoHash: 'test1hash',
    hasExifData: true
  });
  
  console.log(`Score: ${test1.fraudScore}/100 - IsFraud: ${test1.isFraud}`);
  console.log(`Reason: ${test1.reason}`);
  console.log('---\n');

  // TEST 2: Pothole detected in "pothole" complaint
  console.log('TEST 2: Pothole image + pothole complaint');
  console.log('Expected: CLEAN (0) - perfect match');
  
  const potholeObject = [
    { object: 'pothole', confidence: 0.92 },
    { object: 'road', confidence: 0.88 }
  ];
  
  const objectMatch2 = matchObjectsToComplaint(potholeObject, 'Large pothole on Main Street');
  console.log(`Object Match: ${objectMatch2.matched}/${objectMatch2.total} (${objectMatch2.alignment}%)`);
  
  const test2 = await validateImageComplaint({
    complaintText: 'Large pothole on Main Street with damage',
    imageCaption: 'A large pothole in the road surface',
    detectedObjects: potholeObject,
    photoHash: 'test2hash',
    hasExifData: true
  });
  
  console.log(`Score: ${test2.fraudScore}/100 - IsFraud: ${test2.isFraud}`);
  console.log(`Reason: ${test2.reason}`);
  console.log('---\n');

  // TEST 3: Garbage detected in "garbage" complaint
  console.log('TEST 3: Garbage pile image + garbage complaint');
  console.log('Expected: CLEAN (0) - good match');
  
  const garbageObjects = [
    { object: 'garbage', confidence: 0.94 },
    { object: 'trash', confidence: 0.91 },
    { object: 'street', confidence: 0.82 }
  ];
  
  const objectMatch3 = matchObjectsToComplaint(garbageObjects, 'Garbage not cleared for days');
  console.log(`Object Match: ${objectMatch3.matched}/${objectMatch3.total} (${objectMatch3.alignment}%)`);
  
  const test3 = await validateImageComplaint({
    complaintText: 'Garbage not cleared for days',
    imageCaption: 'A pile of trash and garbage on the street',
    detectedObjects: garbageObjects,
    photoHash: 'test3hash',
    hasExifData: true
  });
  
  console.log(`Score: ${test3.fraudScore}/100 - IsFraud: ${test3.isFraud}`);
  console.log(`Reason: ${test3.reason}`);
  console.log('---\n');

  // TEST 4: No objects detected (generic image)
  console.log('TEST 4: No objects detected + water complaint');
  console.log('Expected: FLAGGED (55+) - no civic objects');
  
  const test4 = await validateImageComplaint({
    complaintText: 'water leakage',
    imageCaption: 'A blank white image',
    detectedObjects: [],
    photoHash: 'test4hash',
    hasExifData: false
  });
  
  console.log(`Score: ${test4.fraudScore}/100 - IsFraud: ${test4.isFraud}`);
  console.log(`Reason: ${test4.reason}`);
  console.log('---\n');

  // TEST 5: Traffic light detected in "traffic" complaint
  console.log('TEST 5: Broken traffic light image + traffic complaint');
  console.log('Expected: CLEAN/SUSPICIOUS (0-20)');
  
  const trafficObjects = [
    { object: 'traffic light', confidence: 0.93 },
    { object: 'pole', confidence: 0.85 }
  ];
  
  const objectMatch5 = matchObjectsToComplaint(trafficObjects, 'Broken traffic signal at intersection');
  console.log(`Object Match: ${objectMatch5.matched}/${objectMatch5.total} (${objectMatch5.alignment}%)`);
  
  const test5 = await validateImageComplaint({
    complaintText: 'Broken traffic signal at intersection',
    imageCaption: 'A malfunctioning traffic light with red wires',
    detectedObjects: trafficObjects,
    photoHash: 'test5hash',
    hasExifData: true
  });
  
  console.log(`Score: ${test5.fraudScore}/100 - IsFraud: ${test5.isFraud}`);
  console.log(`Reason: ${test5.reason}`);
  console.log('---\n');

  console.log('========================================');
  console.log('YOLO v8 BENEFITS');
  console.log('========================================');
  console.log('✓ Direct object matching - catches mismatches instantly');
  console.log('✓ No API calls needed - runs locally, 100% free');
  console.log('✓ High accuracy - YOLOv8 nano ~80-90% accuracy');
  console.log('✓ Fast detection - <500ms per image');
  console.log('✓ Handles civic objects: pothole, garbage, water, traffic light, etc.');
  console.log('========================================\n');
}

// Run tests
testObjectDetection().catch(console.error);
