const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const clearUsers = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB...');
    
    const result = await User.deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} users.`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error clearing users:', err);
    process.exit(1);
  }
};

clearUsers();
