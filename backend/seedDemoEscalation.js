/**
 * Seed Demo Escalation Complaints
 * Creates 3 complaints from 3 days ago in the Road department.
 * Run: node seedDemoEscalation.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Complaint = require('./models/Complaint');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const complaints = [
      {
        trackingId: `DEMO-3D-ROD-01`,
        name: "Vijay Kumar",
        location: "K.K. Nagar Main Road, Chennai",
        complaintText: "Severe potholes throughout the junction, difficult for two-wheelers.",
        summary: "Potholes on junction causing safety risk.",
        category: "Road",
        departmentCode: "ROD",
        status: "Pending",
        verificationDecision: "REAL",
        fraudStatus: "Clean",
        severity: "High",
        priority: "High",
        createdAt: threeDaysAgo
      },
      {
        trackingId: `DEMO-3D-ROD-02`,
        name: "Arun Prasath",
        location: "Mount Road Overpass, Chennai",
        complaintText: "Multiple deep potholes near the bridge entrance.",
        summary: "Deep potholes at bridge entrance.",
        category: "Road",
        departmentCode: "ROD",
        status: "Pending",
        verificationDecision: "REAL",
        fraudStatus: "Clean",
        severity: "Medium",
        priority: "High",
        createdAt: threeDaysAgo
      },
      {
        trackingId: `DEMO-3D-ROD-03`,
        name: "Priya Sundar",
        location: "Near T.Nagar Bus Stand, Chennai",
        complaintText: "Large potholes filled with water, causing traffic congestion.",
        summary: "Water-filled potholes near bus stand.",
        category: "Road",
        departmentCode: "ROD",
        status: "Pending",
        verificationDecision: "REAL",
        fraudStatus: "Clean",
        severity: "Critical",
        priority: "High",
        createdAt: threeDaysAgo
      }
    ];

    console.log(`Deleting any previous demo complaints with the same IDs...`);
    await Complaint.deleteMany({ trackingId: { $in: complaints.map(c => c.trackingId) } });

    console.log(`Inserting 3 demo complaints...`);
    await Complaint.insertMany(complaints);

    console.log(`✅ Success! 3 complaints created with createdAt: ${threeDaysAgo.toISOString()}`);
    console.log(`Department: Road (ROD), Status: Pending, Fraud Check: Clean`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding demo complaints:', error);
    process.exit(1);
  }
}

seed();
