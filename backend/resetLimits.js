require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/civic-complaints');
  const result = await User.updateMany({}, {
    $set: {
      submissionBannedUntil: null,
      fakeFlagsLast30d: 0,
      lastFakeFlagAt: null
    }
  });
  console.log('Reset done:', result.modifiedCount, 'user(s) updated');
  process.exit(0);
})();
