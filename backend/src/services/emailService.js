const crypto = require('crypto');
const db = require('../config/db');

const APP_NAME = process.env.MOCKBEE_APP_NAME || 'MockBee';
const APP_URL = process.env.MOCKBEE_APP_URL || 'http://127.0.0.1:8001';
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM || 'MockBee <onboarding@resend.dev>';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';

function isEmailEnabled() {
  if (EMAIL_PROVIDER === 'resend') {
    return Boolean(RESEND_API_KEY && EMAIL_FROM);
  }
  if (EMAIL_PROVIDER === 'disabled' || EMAIL_PROVIDER === 'none') {
    return false;
  }
  return false;
}

function utcNow() {
  return new Date();
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlDocument(title, body) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #e7e2d8;border-radius:10px;padding:26px;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">${title}</h1>
        ${body}
        <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Team ${APP_NAME}</p>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmail(toEmail, subject, htmlBody, textBody, eventType, metadata = {}) {
  const event = {
    to_email: toEmail,
    subject,
    event_type: eventType,
    metadata: metadata || {},
    created_at: db.now(),
    status: 'skipped',
    provider: EMAIL_PROVIDER,
  };

  try {
    if (!toEmail || !String(toEmail).includes('@')) {
      event.status = 'failed';
      event.error = 'Invalid recipient email';
      await (await db.col('email_events')).insertOne(event);
      return event;
    }

    if (!isEmailEnabled()) {
      event.reason = `${EMAIL_PROVIDER} email provider is not configured`;
      await (await db.col('email_events')).insertOne(event);
      return event;
    }

    if (EMAIL_PROVIDER === 'resend') {
      return sendWithResend(toEmail, subject, htmlBody, textBody, event);
    }

    event.status = 'failed';
    event.error = `Unsupported email provider: ${EMAIL_PROVIDER}`;
    await (await db.col('email_events')).insertOne(event);
    return event;
  } catch (err) {
    event.status = 'failed';
    event.error = String(err.message || err);
    try {
      await (await db.col('email_events')).insertOne(event);
    } catch (_) {
      /* ignore */
    }
    return event;
  }
}

async function sendWithResend(toEmail, subject, htmlBody, textBody, event) {
  const idempotencySeed = `${event.event_type}:${toEmail}:${(event.metadata && event.metadata.session_id) || event.created_at}`;
  const idempotencyKey = crypto.createHash('sha256').update(idempotencySeed).digest('hex');
  const payload = {
    from: EMAIL_FROM,
    to: [toEmail],
    subject,
    html: htmlBody,
    text: textBody,
  };

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const responseBody = await response.text();
    if (!response.ok) {
      event.status = 'failed';
      event.error = responseBody || `HTTP ${response.status}`;
      event.status_code = response.status;
    } else {
      event.status = 'sent';
      event.sent_at = db.now();
      event.provider_response = responseBody ? JSON.parse(responseBody) : {};
    }
  } catch (err) {
    event.status = 'failed';
    event.error = String(err.message || err);
  }

  await (await db.col('email_events')).insertOne(event);
  return event;
}

async function sendWelcomeEmail(toEmail, name = '') {
  const firstName = escapeHtml((name || 'there').trim().split(' ')[0]);
  const subject = `Welcome to ${APP_NAME}`;
  const body = htmlDocument(
    subject,
    `
        <p style="line-height:1.6;">Hi ${firstName},</p>
        <p style="line-height:1.6;">Welcome to ${APP_NAME}. Your account is ready, and you can start practicing interviews, reviewing reports, and tracking progress from your dashboard.</p>
        <p style="margin:22px 0;"><a href="${APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Open Dashboard</a></p>
        `
  );
  const text = `Hi ${firstName}, welcome to ${APP_NAME}. Open your dashboard: ${APP_URL}/dashboard.html`;
  return sendEmail(toEmail, subject, body, text, 'welcome');
}

async function sendInterviewReportEmail(toEmail, name, session) {
  const firstName = escapeHtml((name || 'there').trim().split(' ')[0]);
  const role = escapeHtml(session.role || 'your interview');
  const score = session.score;
  const analysis = session.analysis || {};
  const scoreText = score != null ? `${score}%` : 'available';
  const feedback = escapeHtml(analysis.feedback || 'Your interview report has been generated.');
  const subject = `Your ${APP_NAME} interview report is ready`;
  const body = htmlDocument(
    subject,
    `
        <p style="line-height:1.6;">Hi ${firstName},</p>
        <p style="line-height:1.6;">Your report for <strong>${role}</strong> is ready. Overall score: <strong>${scoreText}</strong>.</p>
        <p style="line-height:1.6;background:#f9fafb;border-left:4px solid #d4a017;padding:12px 14px;">${feedback}</p>
        <p style="margin:22px 0;"><a href="${APP_URL}/performance.html?view=report" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">View Report</a></p>
        `
  );
  const text = `Hi ${firstName}, your ${role} report is ready. Score: ${scoreText}. View it: ${APP_URL}/performance.html?view=report`;
  return sendEmail(toEmail, subject, body, text, 'interview_report', { session_id: session.id });
}

async function sendTaskCompletionEmail(toEmail, name, taskName, detail = '') {
  const firstName = escapeHtml((name || 'there').trim().split(' ')[0]);
  const task = escapeHtml(taskName || 'your task');
  const safeDetail = escapeHtml(detail);
  const subject = `Nice work completing ${task}`;
  const body = htmlDocument(
    subject,
    `
        <p style="line-height:1.6;">Hi ${firstName},</p>
        <p style="line-height:1.6;">You completed <strong>${task}</strong>. ${safeDetail}</p>
        <p style="margin:22px 0;"><a href="${APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Continue Practicing</a></p>
        `
  );
  const text = `Hi ${firstName}, you completed ${task}. ${detail} Continue: ${APP_URL}/dashboard.html`;
  return sendEmail(toEmail, subject, body, text, 'task_completed', { task_name: task });
}

async function sendInactivityReminderEmail(toEmail, name, inactiveDays) {
  const firstName = escapeHtml((name || 'there').trim().split(' ')[0]);
  const subject = `Ready for your next ${APP_NAME} practice?`;
  const body = htmlDocument(
    subject,
    `
        <p style="line-height:1.6;">Hi ${firstName},</p>
        <p style="line-height:1.6;">It has been about ${inactiveDays} days since your last practice. A short session today can keep your interview rhythm fresh.</p>
        <p style="margin:22px 0;"><a href="${APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Start Practice</a></p>
        `
  );
  const text = `Hi ${firstName}, it has been about ${inactiveDays} days since your last practice. Start here: ${APP_URL}/dashboard.html`;
  return sendEmail(toEmail, subject, body, text, 'inactivity_reminder', { inactive_days: inactiveDays });
}

function parseDbDatetime(value) {
  if (!value) return null;
  try {
    const d = new Date(String(value).replace('Z', '+00:00'));
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch (_) {
    return null;
  }
}

module.exports = {
  isEmailEnabled,
  utcNow,
  sendWelcomeEmail,
  sendInterviewReportEmail,
  sendTaskCompletionEmail,
  sendInactivityReminderEmail,
  parseDbDatetime,
};
