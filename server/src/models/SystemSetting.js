const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, default: 'operations', unique: true, immutable: true },
  meetingDurationMinutes: { type: Number, min: 15, max: 480, default: 30 },
  companyName: { type: String, trim: true, maxlength: 120, default: 'Visitor Pass Management System' },
  receptionPhone: { type: String, trim: true, maxlength: 30, default: '' },
  receptionEmail: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('SystemSetting', schema);
