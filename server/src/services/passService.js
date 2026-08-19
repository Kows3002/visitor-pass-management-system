const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const settingService = require('./settingService');
const AppError = require('../utils/appError');

const dateText = (value) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' });
const publicAppOrigin = () => {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  const allowed = String(process.env.CLIENT_URL || '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  const deployedOrigin = allowed.find((origin) => /^https:\/\//i.test(origin) && !/localhost|127\.0\.0\.1|\[::1\]/i.test(origin));
  if (configured && (!/localhost|127\.0\.0\.1|\[::1\]/i.test(configured) || !deployedOrigin)) return configured;
  return deployedOrigin || allowed[0] || 'http://localhost:5173';
};
const verificationUrl = (visitor) => `${publicAppOrigin()}/pass/verify/${visitor.passCode}`;
const ensureCredential = async (visitor) => {
  let changed = false;
  if (!visitor.passNumber) { visitor.passNumber = `VP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; changed = true; }
  if (!visitor.passCode) { visitor.passCode = crypto.randomBytes(24).toString('hex'); changed = true; }
  if (!visitor.meetingDurationMinutes) { visitor.meetingDurationMinutes = 30; changed = true; }
  if (changed && typeof visitor.save === 'function') await visitor.save({ validateBeforeSave: false });
  return visitor;
};

exports.load = async (id, user) => {
  const Visitor = require('../models/Visitor');
  const filter = { _id: id };
  if (user.role === 'employee') filter.employee = user._id;
  const visitor = await Visitor.findOne(filter).populate('employee', 'name email').populate('department', 'name code').populate('reviewedBy', 'name role');
  if (!visitor) throw new AppError('Visitor pass not found', 404, 'NOT_FOUND');
  if (!['approved', 'checked_in', 'checked_out'].includes(visitor.status)) throw new AppError('A pass is available only after approval', 409, 'PASS_NOT_AVAILABLE');
  return ensureCredential(visitor);
};

exports.publicDetails = async (code) => {
  const Visitor = require('../models/Visitor');
  const visitor = await Visitor.findOne({ passCode: code }).populate('employee', 'name').populate('department', 'name');
  if (!visitor) throw new AppError('Visitor pass is invalid', 404, 'INVALID_PASS');
  return { passNumber: visitor.passNumber, visitorName: visitor.visitorName, host: visitor.employee?.name, department: visitor.department?.name, visitDate: visitor.visitDate, expectedArrival: visitor.expectedArrival, expectedDeparture: visitor.expectedDeparture, status: visitor.status };
};

exports.generatePdf = async (visitor) => {
  await ensureCredential(visitor);
  const settings = await settingService.get();
  const qr = await QRCode.toBuffer(verificationUrl(visitor), { width: 190, margin: 1, errorCorrectionLevel: 'M' });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Visitor Pass ${visitor.passNumber}` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.rect(0, 0, 595, 842).fill('#F4F6F5');
    doc.roundedRect(42, 42, 511, 758, 12).fillAndStroke('#FFFFFF', '#CAD3D0');
    doc.rect(42, 42, 511, 96).fill('#203846');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17).text(settings.companyName || 'Visitor Pass Management System', 66, 70, { width: 345, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#DCE6E2').text('SECURE WORKPLACE VISITOR PASS', 66, 103);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF').text(visitor.passNumber, 420, 78, { width: 105, align: 'right' });
    doc.font('Helvetica').fontSize(9).text(String(visitor.status).replace('_', ' ').toUpperCase(), 420, 100, { width: 105, align: 'right' });
    doc.fillColor('#1F2D35').font('Helvetica-Bold').fontSize(26).text(visitor.visitorName, 66, 166);
    doc.font('Helvetica').fontSize(11).fillColor('#65757E').text(visitor.companyName || 'Independent visitor', 66, 202);
    const rows = [['Mobile', visitor.phone], ['Email', visitor.email || 'Not provided'], ['Purpose', visitor.purpose], ['Host employee', visitor.employee?.name || '-'], ['Department', visitor.department?.name || '-'], ['Visit date', dateText(visitor.visitDate)], ['Scheduled meeting', `${visitor.expectedArrival} - ${visitor.expectedDeparture} (${visitor.meetingDurationMinutes} min)`], ['Actual check-in', visitor.checkedInAt ? new Date(visitor.checkedInAt).toLocaleString('en-GB') : 'Not recorded'], ['Actual check-out', visitor.checkedOutAt ? new Date(visitor.checkedOutAt).toLocaleString('en-GB') : 'Not recorded']];
    let y = 246;
    rows.forEach(([label, value], index) => { if (index % 2 === 0) doc.rect(66, y - 7, 330, 37).fill('#F6F8F7'); doc.fillColor('#65757E').font('Helvetica').fontSize(8).text(label.toUpperCase(), 76, y); doc.fillColor('#1F2D35').font('Helvetica-Bold').fontSize(10).text(String(value), 180, y, { width: 205 }); y += 37; });
    doc.image(qr, 420, 250, { width: 105 });
    doc.fillColor('#1F2D35').font('Helvetica-Bold').fontSize(11).text('Scan to verify', 420, 365, { width: 105, align: 'center' });
    doc.fillColor('#65757E').font('Helvetica').fontSize(8).text('The QR contains only a secure pass reference.', 416, 383, { width: 113, align: 'center' });
    doc.moveTo(66, 620).lineTo(529, 620).strokeColor('#CAD3D0').stroke();
    doc.fillColor('#1F2D35').font('Helvetica-Bold').fontSize(11).text('Visitor instructions', 66, 642);
    doc.fillColor('#65757E').font('Helvetica').fontSize(9).text('Present this pass at reception. Carry your government ID. Follow workplace safety and access instructions. This pass is valid only for the visit shown above.', 66, 665, { width: 463, lineGap: 4 });
    const contact = [settings.receptionPhone, settings.receptionEmail].filter(Boolean).join('  |  ');
    doc.fontSize(8).text(contact || 'Contact reception for assistance', 66, 754, { width: 463, align: 'center' });
    doc.end();
  });
};

exports.verificationUrl = verificationUrl;
exports.publicAppOrigin = publicAppOrigin;
