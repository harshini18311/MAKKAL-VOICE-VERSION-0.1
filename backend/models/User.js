const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deviceSignatureSchema = new mongoose.Schema({
  hash: { type: String },
  userAgent: { type: String },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['citizen', 'department', 'admin'], default: 'citizen' },
  department: { type: String },           // e.g. 'Water', 'Road' — only for role='department'
  departmentCode: { type: String },       // e.g. 'WTR', 'ROD' — only for role='department'
  trustScore: { type: Number, default: 50, min: 0, max: 100 },
  deviceFingerprints: { type: [String], default: [] },
  deviceSignatures: { type: [deviceSignatureSchema], default: [] },
  phoneVerified: { type: Boolean, default: true },
  submissionBannedUntil: { type: Date, default: null },
  fakeFlagsLast30d: { type: Number, default: 0 },
  lastFakeFlagAt: { type: Date }
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
