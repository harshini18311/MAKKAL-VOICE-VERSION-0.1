require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const twilioRoutes = require('./routes/twilioRoutes');
const exotelRoutes = require('./routes/exotelRoutes');
const sosRoutes = require('./routes/sosRoutes');
const { startDailyDigestScheduler } = require('./services/escalationService');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Skip ngrok browser warning page for all responses (needed for Exotel webhooks)
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Global Request Logger — logs full params to help debug Exotel webhook format
app.use((req, res, next) => {
  const params = { ...req.query, ...req.body };
  const hasParams = Object.keys(params).length > 0;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}${hasParams ? ' | params: ' + JSON.stringify(params) : ''}`);
  next();
});

// Routes
// Smart root handler: if Exotel params present, serve IVR; else show status page
app.all('/', express.urlencoded({ extended: true }), (req, res, next) => {
  const params = { ...req.query, ...req.body };
  const isExotel = params.CallSid || params.callsid || params.From || params.CallFrom;
  if (isExotel) {
    console.log(`[ROOT→Exotel] Detected Exotel call at root — forwarding to /api/exotel/incoming`);
    req.url = '/incoming';
    return exotelRoutes(req, res, next);
  }
  res.send('MAKKAL VOICE API is running!');
});

app.use('/api/auth', authRoutes);
app.use('/api/complaint', complaintRoutes);
app.use('/api/twilio', express.urlencoded({ extended: true }), twilioRoutes);
app.use('/api/exotel', express.urlencoded({ extended: true }), exotelRoutes);
app.use('/api/sos', sosRoutes);

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
    startDailyDigestScheduler();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// HTTP Server
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
