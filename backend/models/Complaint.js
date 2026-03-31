const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  name: { type: String },
  location: { type: String },
  complaintText: { type: String, required: true },
  category: { type: String, enum: ['Water', 'Road', 'Electricity', 'Infrastructure', 'Public Safety', 'Sanitation', 'Traffic', 'Government Services', 'Rural specific', 'Other'], default: 'Other' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  summary: { type: String },
  image: { type: String },
  emailDraft: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'QueuedReview', 'Resolved', 'Rejected', 'Merged', 'Related', 'InProgress'],
    default: 'Pending'
  },
  resolvedAt: { type: Date },
  departmentResponse: { type: String },
  resolutionImage: { type: String },
  escalations: [{
    raisedAt: { type: Date, default: Date.now },
    message: { type: String },
    raisedBy: { type: String },
    answeredAt: { type: Date },
    answerReason: { type: String, enum: ['already resolved', 'no such problem exist', 'others'] },
    answerMessage: { type: String },
    answerImage: { type: String }
  }],
  trackingId: { type: String, unique: true },
  verificationScore: { type: Number, default: 100 },
  verificationDecision: {
    type: String,
    enum: ['REAL', 'HUMAN_REVIEW', 'FAKE', 'DUPLICATE', 'RELATED'],
    default: 'REAL'
  },
  flags: { type: [String], default: [] },
  fingerprint: { type: String },
  exifData: { type: Object },
  geoLocation: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] }
  },
  lat: { type: Number },
  lng: { type: Number },
  gpsCapturedAt: { type: Date },
  ipAddress: { type: String },
  embeddings: {
    text: { type: [Number], default: undefined },
    image: { type: [Number], default: undefined }
  },
  linkedComplaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint' },
  duplicateSimilarity: { type: Number },
  departmentCode: { type: String, default: 'GEN' },
  descriptionShingles: { type: String },
  verificationDetails: { type: Object },

  // Enhancement 6: Ticket ID + Audit Trail
  rawAudioS3Key: { type: String },           // S3 key for raw audio recording (dispute resolution/QA)

  // Enhancement 5: Classification Agent fields
  severity: {
    type: String,
    enum: ['Critical', 'High', 'Medium', 'Low'],
    default: 'Medium'
  },
  estimatedResolutionDays: { type: Number, default: 7 },
  department: { type: String },               // Full department name

  // Enhancement 1-3: Telephony + Data Collection
  callerPhone: { type: String },              // Caller's phone number from IVR
  language: { type: String },                 // BCP-47 language code (e.g., 'ta-IN')

  // Enhancement 4: Structured complaint data from single-LLM call
  structuredData: { type: Object },           // { name_en, name_original, address_en, district, ward, pincode, issue_en, ... }

  // Enhancement 5: Full classification result
  classificationData: { type: Object }        // { category, severity, department, departmentCode, estimatedResolutionDays, ... }
}, { timestamps: true });

complaintSchema.index({ geoLocation: '2dsphere' }, { sparse: true });
complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
