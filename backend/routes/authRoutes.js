const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const { sendOTPEmail } = require('../../ai-services/emailService');

const router = express.Router();

// Memory store for OTPs (In-memory is fine for this hackathon demo)
const otpStore = {}; 

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', {
    expiresIn: '30d',
  });
};

router.post('/send-otp', async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) return res.status(400).json({ error: 'Contact field (Email or Phone) is required' });

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[contact] = otp;

    const isEmail = contact.includes('@');

    if (isEmail) {
      try {
        await sendOTPEmail(contact, otp);
      } catch (err) {
        console.error(`[ERROR] Email failed to send: ${err.message}`);
        return res.status(500).json({ error: 'Failed to send OTP email. Please check SMTP credentials.' });
      }
    } else {
      // ULTRA-VISIBLE Mock for SMS
      console.log(`\n\n\n\n\n`);
      console.log(`*****************************************`);
      console.log(`* 📱 [SMS GATEWAY MOCK] - NEW MESSAGE   *`);
      console.log(`*****************************************`);
      console.log(`* TO:      ${contact}`);
      console.log(`* MESSAGE: Your MAKKAL VOICE code is: ${otp}`);
      console.log(`* STATUS:  DELIVERED SUCCESSFULLY ✅    *`);
      console.log(`*****************************************`);
      console.log(`\n\n\n\n\n`);
    }

    res.json({ 
      message: isEmail 
        ? 'Verification code has been sent to your email address!' 
        : 'OTP sent successfully. Look at the Backend Terminal for the code!' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body;
    const contact = email || phone;
    
    // Validate OTP
    if (!otp || otpStore[contact] !== otp) {
      return res.status(400).json({ error: 'Invalid or missing OTP' });
    }

    // Fix: Only check for fields that are actually provided
    const orQuery = [];
    if (email) orQuery.push({ email });
    if (phone) orQuery.push({ phone });

    if (orQuery.length > 0) {
      const userExists = await User.findOne({ $or: orQuery });
      if (userExists) {
        return res.status(400).json({ error: 'User already exists' });
      }
    }

    const user = await User.create({ name, email, phone, password, phoneVerified: true, role: 'citizen' });
    
    // Clear OTP after use
    delete otpStore[contact];

    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: 'citizen',
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    console.log('Login attempt:', { email, phone, password_provided: !!password });
    
    // Special Admin Logic for Hackathon
    if (email === 'admin@issue' && password === 'admin@123') {
      return res.json({
        _id: 'admin-id-001',
        name: 'System Admin',
        email: 'admin@issue',
        isAdmin: true,
        role: 'admin',
        token: generateToken('admin-id-001')
      });
    }

    const query = email ? { email } : { phone };
    const user = await User.findOne(query);
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const responseData = {
      _id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role || 'citizen',
      token: generateToken(user._id)
    };

    // Include department info for department users
    if (user.role === 'department') {
      responseData.department = user.department;
      responseData.departmentCode = user.departmentCode;
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
