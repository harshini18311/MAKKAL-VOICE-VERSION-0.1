const mongoose = require('mongoose');

const auditEntrySchema = new mongoose.Schema({
  stage: { type: Number },
  name: { type: String },
  flags: { type: [String], default: [] },
  partialScore: { type: Number },
  at: { type: Date, default: Date.now }
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
  entries: { type: [auditEntrySchema], default: [] },
  stageResults: { type: Object, required: true },
  finalScore: { type: Number, required: true },
  decision: { type: String, enum: ['REAL', 'HUMAN_REVIEW', 'FAKE', 'DUPLICATE', 'RELATED'], required: true },
  previousHash: { type: String },
  currentHash: { type: String, required: true },
  overrideReason: { type: String },
  overriddenBy: { type: String },
  overriddenAt: { type: Date }
}, { timestamps: true });

auditLogSchema.index({ complaintId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
