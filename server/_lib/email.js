// MARKLEY EmailService + in-app notification writer (Phase 5).
// Resend keys stay server-only. If unconfigured, emails are skipped (in-app still works).
import { Resend } from 'resend';

const APP = process.env.APP_URL || '';

export async function notifyUsers(admin, { user_ids, type, title, body = '', link = '' }) {
  const ids = [...new Set((user_ids || []).filter(Boolean))].slice(0, 500);
  if (!ids.length) return 0;
  const rows = ids.map((user_id) => ({ user_id, type, title: String(title).slice(0, 200), body: String(body).slice(0, 1000), link: String(link).slice(0, 500) }));
  const { error } = await admin.from('notifications').insert(rows);
  return error ? 0 : rows.length;
}

function resendClient() {
  const key = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || '';
  if (!key || !from) return null;
  return { client: new Resend(key), from };
}

function shell(title, bodyHtml, link) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2>${title}</h2><div>${bodyHtml}</div>
    ${link ? `<p><a href="${link}">${link}</a></p>` : ''}
    <p style="color:#64748b;font-size:12px">Markley Educational Platform</p></div>`;
}

export async function sendEmail(admin, userIds, subject, title, bodyHtml, link = '') {
  const rs = resendClient();
  if (!rs) return 0;
  const ids = [...new Set((userIds || []).filter(Boolean))].slice(0, 100);
  if (!ids.length) return 0;
  const { data: profs } = await admin.from('profiles').select('id,email,email_notifications,status').in('id', ids);
  const to = (profs || []).filter((p) => p.status === 'active' && p.email_notifications !== false).map((p) => p.email);
  if (!to.length) return 0;
  try {
    await rs.client.emails.send({
      from: rs.from,
      to, // Resend accepts arrays on most plans; falls back gracefully per provider limits
      subject: String(subject).slice(0, 120),
      html: shell(title, bodyHtml, link || APP),
    });
    return to.length;
  } catch { return 0; }
}

export const appLink = (path) => (APP ? APP.replace(/\/$/, '') + path : path);
