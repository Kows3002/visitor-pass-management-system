const nodemailer = require('nodemailer');
const Employee = require('../models/Employee');

const SMS_ENDPOINT = 'https://api.twilio.com/2010-04-01/Accounts';
const clean = (value) => String(value || '').trim();
const normalizeAppPassword = (value) => clean(value).replace(/\s+/g, '');
const escapeHtml = (value) => clean(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));
const maskEmail = (value) => {
  const [name, domain] = clean(value).split('@');
  return domain ? `${name.slice(0, 2)}***@${domain}` : 'unavailable';
};
const maskPhone = (value) => clean(value).replace(/.(?=.{4})/g, '*');
const timeoutSignal = () => (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined);
const smtpSecure = () => clean(process.env.SMTP_SECURE).toLowerCase() !== 'false';
const smtpPort = () => Number(process.env.SMTP_PORT || 465);
let transporterOverride;

const smtpConfiguration = () => {
  const host = clean(process.env.SMTP_HOST);
  const user = clean(process.env.SMTP_USER);
  const password = normalizeAppPassword(process.env.SMTP_PASSWORD);
  const from = clean(process.env.NOTIFICATION_FROM_EMAIL);
  if (!host || !user || !password || !from) return null;
  const port = smtpPort();
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, secure: smtpSecure(), user, password, from };
};

const createTransporter = (config) => transporterOverride || nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.secure,
  auth: { user: config.user, pass: config.password },
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const providerError = async (response) => {
  let message = `Provider returned HTTP ${response.status}`;
  try {
    const payload = await response.json();
    message = payload.message || payload.error?.message || message;
  } catch { /* Provider did not return JSON. */ }
  return message;
};

const visitDateText = (visitor) => new Date(visitor.visitDate).toLocaleDateString('en-GB', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
});

const emailContent = (visitor, decision) => {
  const approved = decision === 'approved';
  const host = visitor.employee?.name || 'your host employee';
  const heading = approved ? 'Your workplace visit is confirmed' : 'Your visitor request was not approved';
  const decisionText = approved
    ? 'Your visitor request has been approved.'
    : 'Your visitor request has been reviewed and rejected.';
  const nextStep = approved
    ? 'Please report to reception when you arrive.'
    : 'Please contact your host if you need further information or would like to arrange another visit.';
  const subject = `Visitor request ${approved ? 'approved' : 'rejected'} for ${visitDateText(visitor)}`;
  const detailRows = [
    ['Host', host], ['Visit date', visitDateText(visitor)],
    ['Scheduled time', `${visitor.expectedArrival} – ${visitor.expectedDeparture}`], ['Purpose', visitor.purpose],
  ];
  if (!approved && visitor.remarks) detailRows.push(['Remarks', visitor.remarks]);
  const text = [
    `Hello ${visitor.visitorName},`, '', decisionText, '',
    ...detailRows.map(([label, value]) => `${label}: ${value}`), '', nextStep, '',
    'Visitor Pass Management System',
  ].join('\n');
  const rows = detailRows.map(([label, value], index) => `<tr${index % 2 ? ' style="background:#f7f8f8"' : ''}><td style="padding:8px;color:#65757e">${escapeHtml(label)}</td><td style="padding:8px"><strong>${escapeHtml(value)}</strong></td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f7;font-family:Arial,sans-serif;color:#1f2d35"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #d8e0e4"><tr><td style="padding:22px 28px;background:#203846;color:#fff"><strong style="font-size:18px">Visitor Pass Management System</strong></td></tr><tr><td style="padding:30px 28px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${approved ? '#3f7256' : '#a54b3d'};font-weight:bold">Request ${escapeHtml(decision)}</div><h1 style="font-size:24px;margin:10px 0 12px">${escapeHtml(heading)}</h1><p style="line-height:1.6">Hello ${escapeHtml(visitor.visitorName)}, ${escapeHtml(decisionText.toLowerCase())}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-collapse:collapse;border:1px solid #d8e0e4">${rows}</table><p style="line-height:1.6">${escapeHtml(nextStep)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
};

async function sendEmail(visitor, decision) {
  if (!visitor.email) return { channel: 'email', status: 'skipped', reason: 'visitor_email_missing' };
  const config = smtpConfiguration();
  if (!config) return { channel: 'email', status: 'not_configured', reason: 'smtp_configuration_missing_or_invalid' };
  try {
    const info = await createTransporter(config).sendMail({
      from: config.from,
      to: visitor.email,
      replyTo: clean(process.env.NOTIFICATION_REPLY_TO) || undefined,
      ...emailContent(visitor, decision),
    });
    console.info('[notification] visitor decision email sent', {
      visitorId: String(visitor._id), decision, recipient: maskEmail(visitor.email), provider: 'gmail-smtp', messageId: info.messageId,
    });
    return { channel: 'email', status: 'delivered', provider: 'gmail-smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[notification] visitor decision email failed', {
      visitorId: String(visitor._id), decision, recipient: maskEmail(visitor.email), provider: 'gmail-smtp', code: error.code || 'SMTP_ERROR', error: error.message,
    });
    return { channel: 'email', status: 'failed', provider: 'gmail-smtp', reason: error.code || 'smtp_error' };
  }
}

async function sendOperationalEmail({ to, cc, subject, text, html, attachments, event, visitorId }) {
  if (!to) return { channel: 'email', status: 'skipped', reason: 'recipient_missing' };
  const config = smtpConfiguration();
  if (!config) return { channel: 'email', status: 'not_configured', reason: 'smtp_configuration_missing_or_invalid' };
  try {
    const info = await createTransporter(config).sendMail({ from: config.from, to, cc, replyTo: clean(process.env.NOTIFICATION_REPLY_TO) || undefined, subject, text, html, attachments });
    console.info('[notification] operational email sent', { visitorId: String(visitorId), event, recipient: maskEmail(to), provider: 'gmail-smtp', messageId: info.messageId });
    return { channel: 'email', status: 'delivered', provider: 'gmail-smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[notification] operational email failed', { visitorId: String(visitorId), event, recipient: maskEmail(to), provider: 'gmail-smtp', code: error.code || 'SMTP_ERROR', error: error.message });
    return { channel: 'email', status: 'failed', provider: 'gmail-smtp', reason: error.code || 'smtp_error' };
  }
}

async function employeeRecipient(visitor) {
  const userId = visitor.employee?._id || visitor.employee;
  const accountEmail = clean(visitor.employee?.email);
  if (!userId) return { to: accountEmail };
  try {
    const profile = await Employee.findOne({ $or: [{ userId }, { user: userId }] }).select('email fullName status').lean();
    const profileEmail = clean(profile?.email);
    const to = profileEmail || accountEmail;
    const cc = accountEmail && profileEmail && accountEmail.toLowerCase() !== profileEmail.toLowerCase() ? accountEmail : undefined;
    if (!to) console.warn('[notification] assigned employee has no deliverable email', { visitorId: String(visitor._id), employeeId: String(userId) });
    return { to, cc };
  } catch (error) {
    console.error('[notification] employee recipient lookup failed', { visitorId: String(visitor._id), employeeId: String(userId), error: error.message });
    return { to: accountEmail };
  }
}

const simpleMessage = (title, greeting, paragraphs) => ({
  text: [greeting, '', ...paragraphs, '', 'Visitor Pass Management System'].join('\n'),
  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2d35;background:#f4f6f7;padding:28px"><main style="max-width:600px;margin:auto;background:white;border:1px solid #d8e0e4;padding:28px"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(greeting)}</p>${paragraphs.map((p) => `<p style="line-height:1.6">${escapeHtml(p)}</p>`).join('')}</main></body></html>`,
});

exports.sendEmployeeAssignmentAlert = async (visitor, reminder = false) => {
  const title = reminder ? 'Visitor arrival confirmed' : 'New visitor assigned to you';
  const content = simpleMessage(title, `Hello ${visitor.employee?.name || 'Employee'},`, [`${visitor.visitorName} has been ${reminder ? 'confirmed at reception' : 'randomly assigned to you'} for ${visitDateText(visitor)} at ${visitor.expectedArrival}.`, `Purpose: ${visitor.purpose}`, reminder ? 'Please prepare to receive the visitor.' : 'Open Visitor Requests to approve or reject this request.']);
  const recipient = await employeeRecipient(visitor);
  return sendOperationalEmail({ ...recipient, subject: `${title}: ${visitor.visitorName}`, ...content, event: reminder ? 'arrival_confirmed' : 'random_assignment', visitorId: visitor._id });
};

exports.sendVisitorPass = async (visitor, pdf) => {
  const content = simpleMessage('Your visitor pass is ready', `Hello ${visitor.visitorName},`, [`Your visit with ${visitor.employee?.name || 'the host'} is approved for ${visitDateText(visitor)} at ${visitor.expectedArrival}.`, 'Your visitor pass is attached. Present it at reception when you arrive.']);
  return sendOperationalEmail({ to: visitor.email, subject: `Visitor pass ${visitor.passNumber}`, ...content, attachments: [{ filename: `${visitor.passNumber}.pdf`, content: pdf, contentType: 'application/pdf' }], event: 'visitor_pass', visitorId: visitor._id });
};

exports.sendNextVisitNotification = (visitor) => {
  const date = visitDateText({ visitDate: visitor.nextVisitDate });
  const content = simpleMessage('Next visiting date scheduled', `Hello ${visitor.visitorName},`, [`Your host has scheduled your next visiting date for ${date}.`, 'Please contact reception or your host if this date is not suitable.']);
  return sendOperationalEmail({ to: visitor.email, subject: `Next visit scheduled for ${date}`, ...content, event: 'next_visit', visitorId: visitor._id });
};

exports.sendNotArrivedNotifications = async (visitor) => {
  const employeeContent = simpleMessage('Visitor has not arrived', `Hello ${visitor.employee?.name || 'Employee'},`, [`Reception marked ${visitor.visitorName} as not arrived for today's appointment.`, 'This is a reminder that the appointment remains recorded in the visitor history.']);
  const visitorContent = simpleMessage('We missed you at reception', `Hello ${visitor.visitorName},`, [`Reception recorded that you did not arrive for your scheduled visit with ${visitor.employee?.name || 'your host'}.`, 'Please contact your host if you need to arrange another date.']);
  const recipient = await employeeRecipient(visitor);
  return Promise.all([
    sendOperationalEmail({ ...recipient, subject: `Visitor not arrived: ${visitor.visitorName}`, ...employeeContent, event: 'not_arrived_employee', visitorId: visitor._id }),
    sendOperationalEmail({ to: visitor.email, subject: 'Scheduled visit - arrival not confirmed', ...visitorContent, event: 'not_arrived_visitor', visitorId: visitor._id }),
  ]);
};

async function sendSms(visitor, decision) {
  const accountSid = clean(process.env.TWILIO_ACCOUNT_SID);
  const authToken = clean(process.env.TWILIO_AUTH_TOKEN);
  const from = clean(process.env.TWILIO_FROM_NUMBER);
  if (!/^\+[1-9]\d{7,14}$/.test(clean(visitor.phone))) return { channel: 'sms', status: 'skipped', reason: 'visitor_phone_must_be_e164' };
  if (!accountSid || !authToken || !from) return { channel: 'sms', status: 'not_configured', reason: 'twilio_configuration_missing' };
  try {
    const body = new URLSearchParams({
      From: from, To: visitor.phone,
      Body: `Visitor Pass: Your visit to ${visitor.employee?.name || 'the workplace'} on ${visitDateText(visitor)} at ${visitor.expectedArrival} was ${decision}.`,
    });
    const response = await fetch(`${SMS_ENDPOINT}/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST', signal: timeoutSignal(),
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json();
    console.info('[notification] visitor decision SMS accepted', { visitorId: String(visitor._id), decision, recipient: maskPhone(visitor.phone), provider: 'twilio', providerId: payload.sid });
    return { channel: 'sms', status: 'delivered', provider: 'twilio', providerId: payload.sid };
  } catch (error) {
    console.error('[notification] visitor decision SMS failed', { visitorId: String(visitor._id), decision, recipient: maskPhone(visitor.phone), provider: 'twilio', error: error.message });
    return { channel: 'sms', status: 'failed', provider: 'twilio', reason: error.name === 'TimeoutError' ? 'provider_timeout' : 'provider_error' };
  }
}

exports.sendDecisionNotification = async (visitor, decision) => {
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Unsupported notification decision');
  const channels = await Promise.all([sendEmail(visitor, decision), sendSms(visitor, decision)]);
  const delivered = channels.filter((item) => item.status === 'delivered').length;
  if (!delivered) console.warn('[notification] visitor decision saved without delivery', {
    visitorId: String(visitor._id), decision, channels: channels.map(({ channel, status, reason }) => ({ channel, status, reason })),
  });
  return { status: delivered ? (delivered === channels.length ? 'delivered' : 'partially_delivered') : 'not_delivered', delivered, channels };
};

exports.verifyConfiguration = async () => {
  const config = smtpConfiguration();
  if (!config) {
    console.warn('[notification] Gmail SMTP is not configured; approval and rejection emails will not be delivered');
    return false;
  }
  try {
    await createTransporter(config).verify();
    console.info('[notification] Gmail SMTP connection verified', {
      host: config.host, port: config.port, secure: config.secure, user: maskEmail(config.user),
    });
    return true;
  } catch (error) {
    console.error('[notification] Gmail SMTP verification failed', {
      host: config.host, port: config.port, secure: config.secure, user: maskEmail(config.user),
      code: error.code || 'SMTP_ERROR', error: error.message,
    });
    return false;
  }
};

exports._private = {
  escapeHtml, maskEmail, maskPhone, emailContent, normalizeAppPassword,
  employeeRecipient, setTransporterForTests(value) { transporterOverride = value; },
};
