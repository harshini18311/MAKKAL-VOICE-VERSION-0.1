const mongoose = require('mongoose');
const User = require('./models/User');
const Complaint = require('./models/Complaint');
require('dotenv').config();

const clearAll = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB...');
    
    const usersResult = await User.deleteMany({ role: { $nin: ['admin', 'department'] } });
    console.log(`Successfully deleted ${usersResult.deletedCount} citizen users.`);
    
    const complaintsResult = await Complaint.deleteMany({});
    console.log(`Successfully deleted ${complaintsResult.deletedCount} complaints.`);
    
    await mongoose.disconnect();
    console.log('Cleanup Complete. Ready for Demo!');
    process.exit(0);
  } catch (err) {
    console.error('Error clearing database:', err);
    process.exit(1);
  }
};

clearAll();
