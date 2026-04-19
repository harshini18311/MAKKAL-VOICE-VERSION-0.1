const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  name: { type: String },
  location: { type: String },
  complaintText: { type: String, required: true },
  category: { type: String, enum: ['Water', 'Road', 'Electricity', 'Infrastructure', 'Public Safety', 'Sanitation', 'Traffic', 'Government Services', 'Rural specific', 'Other'], default: 'Other' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  summary: { type: String },
  emailDraft: { type: String },
  photoHash: { type: String },
  photoCapturedAt: { type: String },
  photoGeo: {
    lat: { type: Number },
    lng: { type: Number }
  },
  status: { type: String, enum: ['Pending', 'Resolved'], default: 'Pending' },
  trackingId: { type: String, unique: true },
  textEmbedding: [{ type: Number }],
  fraudScore: { type: Number, default: 0, min: 0, max: 100 },
  fraudStatus: { type: String, enum: ['Clean', 'Suspicious', 'Flagged'], default: 'Clean' },
  fraudReasons: [{ type: String }],
  sourceIp: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
