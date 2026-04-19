require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const twilioRoutes = require('./routes/twilioRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Global Request Logger for Debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

console.log('DEBUG: JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);

// Routes
app.get('/', (req, res) => res.send('AI-Powered Civic Complaint API is running!'));
app.use('/api/auth', authRoutes);
app.use('/api/complaint', complaintRoutes);
// Note: Twilio webhooks url-encoded bodies. Usually we use express.urlencoded for Twilio.
app.use('/api/twilio', express.urlencoded({ extended: true }), twilioRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Uploaded file is too large. Max size is 8MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
  next();
});

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
