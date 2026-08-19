const nodemailer = require('nodemailer');

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
  setTransporterForTests(value) { transporterOverride = value; },
};
