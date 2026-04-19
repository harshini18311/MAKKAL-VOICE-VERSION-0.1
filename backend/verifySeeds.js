require('dotenv').config();
const mongoose = require('mongoose');
const Complaint = require('./models/Complaint');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';

async function check() {
  await mongoose.connect(MONGO_URI);
  const count = await Complaint.countDocuments({ trackingId: /DEMO-3D-ROD/ });
  console.log(`Count of demo complaints: ${count}`);
  await mongoose.disconnect();
}
check();
