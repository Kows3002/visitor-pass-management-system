const mongoose = require('mongoose');
const crypto = require('crypto');

const schema = new mongoose.Schema({
  visitorName: { type: String, required: true, trim: true, index: true },
  phone: { type: String, required: true, trim: true, index: true },
  email: { type: String, lowercase: true, trim: true },
  governmentId: { type: String, required: true, trim: true, index: true },
  companyName: { type: String, trim: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  purpose: { type: String, required: true, trim: true },
  visitDate: { type: Date, required: true, index: true },
  expectedArrival: { type: String, required: true },
  expectedDeparture: { type: String, required: true },
  scheduledEndAt: { type: Date },
  meetingDurationMinutes: { type: Number, min: 15, max: 480, default: 30 },
  assignmentMethod: { type: String, enum: ['random'], default: 'random' },
  assignedAt: { type: Date, default: Date.now },
  arrivalStatus: { type: String, enum: ['unconfirmed', 'arrived', 'not_arrived'], default: 'unconfirmed', index: true },
  arrivalConfirmedAt: Date,
  arrivalConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  nextVisitDate: Date,
  nextVisitSetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  passNumber: { type: String, unique: true, sparse: true, default: () => `VP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}` },
  passCode: { type: String, unique: true, sparse: true, default: () => crypto.randomBytes(24).toString('hex') },
  passEmailedAt: Date,
  remarks: { type: String, trim: true, maxlength: 1000 },
  photoUrl: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'checked_in', 'checked_out'], default: 'pending', index: true },
  checkedInAt: Date,
  checkedOutAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
}, { timestamps: true });

schema.index({ governmentId: 1, visitDate: 1 }, { unique: true });
schema.index({ phone: 1, visitDate: 1 }, { unique: true });
schema.index({ employee: 1, status: 1, visitDate: -1 });
schema.index({ status: 1, visitDate: -1, expectedArrival: 1 });
schema.index({ visitDate: 1, arrivalStatus: 1, status: 1 });
schema.index({ department: 1, visitDate: -1, status: 1 });
schema.index({ reviewedAt: -1, status: 1 });
schema.index({ checkedInAt: -1 });
schema.index({ checkedOutAt: -1 });
schema.index({ createdAt: -1, status: 1 });

module.exports = mongoose.model('Visitor', schema);
