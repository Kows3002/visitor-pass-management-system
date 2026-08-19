const test = require('node:test');
const assert = require('node:assert/strict');
const notificationService = require('../src/services/notificationService');
const Employee = require('../src/models/Employee');

const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'NOTIFICATION_FROM_EMAIL', 'NOTIFICATION_REPLY_TO'];
const visitor = () => ({
  _id: 'visitor-1', visitorName: 'A & B', email: 'visitor@example.com', phone: '9876543210',
  visitDate: new Date('2026-08-20T00:00:00.000Z'), expectedArrival: '10:00', expectedDeparture: '11:00',
  purpose: 'Project review', remarks: 'Host unavailable', employee: { name: 'Host Employee' },
});
const preserveEnvironment = () => Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));
const restoreEnvironment = (values) => smtpKeys.forEach((key) => {
  if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
});
const configureSmtp = () => Object.assign(process.env, {
  SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true',
  SMTP_USER: 'sender@example.com', SMTP_PASSWORD: 'app-password',
  NOTIFICATION_FROM_EMAIL: 'Visitor Pass <sender@example.com>', NOTIFICATION_REPLY_TO: 'sender@example.com',
});

test('Google App Password formatting spaces are removed', () => {
  assert.equal(notificationService._private.normalizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
});

test('decision notification reports missing SMTP configuration without throwing', async () => {
  const previous = preserveEnvironment();
  smtpKeys.forEach((key) => delete process.env[key]);
  const result = await notificationService.sendDecisionNotification(visitor(), 'approved');
  assert.equal(result.status, 'not_delivered');
  assert.equal(result.channels.find((item) => item.channel === 'email').status, 'not_configured');
  restoreEnvironment(previous);
});

test('approval email uses the stored visitor email through Gmail SMTP', async () => {
  const previous = preserveEnvironment();
  configureSmtp();
  let mail;
  notificationService._private.setTransporterForTests({ sendMail: async (message) => { mail = message; return { messageId: 'approval-123' }; } });
  const result = await notificationService.sendDecisionNotification(visitor(), 'approved');
  assert.equal(mail.to, 'visitor@example.com');
  assert.match(mail.subject, /approved/i);
  assert.match(mail.html, /A &amp; B/);
  assert.equal(result.channels.find((item) => item.channel === 'email').provider, 'gmail-smtp');
  notificationService._private.setTransporterForTests(undefined);
  restoreEnvironment(previous);
});

test('rejection email includes the decision and visitor remarks', async () => {
  const previous = preserveEnvironment();
  configureSmtp();
  let mail;
  notificationService._private.setTransporterForTests({ sendMail: async (message) => { mail = message; return { messageId: 'rejection-123' }; } });
  const result = await notificationService.sendDecisionNotification(visitor(), 'rejected');
  assert.match(mail.subject, /rejected/i);
  assert.match(mail.text, /Host unavailable/);
  assert.equal(result.delivered, 1);
  notificationService._private.setTransporterForTests(undefined);
  restoreEnvironment(previous);
});

test('employee alert uses the linked Employee profile email and copies a different login email', async () => {
  const previous = preserveEnvironment();
  const originalFindOne = Employee.findOne;
  configureSmtp();
  Employee.findOne = () => ({ select() { return this; }, async lean() { return { email: 'profile@example.com', fullName: 'Host Employee', status: 'active' }; } });
  let mail;
  notificationService._private.setTransporterForTests({ sendMail: async (message) => { mail = message; return { messageId: 'employee-123' }; } });
  const target = visitor();
  target.employee = { _id: '507f1f77bcf86cd799439011', name: 'Host Employee', email: 'login@example.com' };
  const result = await notificationService.sendEmployeeAssignmentAlert(target);
  assert.equal(mail.to, 'profile@example.com');
  assert.equal(mail.cc, 'login@example.com');
  assert.equal(result.status, 'delivered');
  Employee.findOne = originalFindOne;
  notificationService._private.setTransporterForTests(undefined);
  restoreEnvironment(previous);
});
