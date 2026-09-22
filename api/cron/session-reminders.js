// /api/cron/session-reminders — daily session reminders (24h window).
// Guarded by CRON_SECRET. Wire in vercel.json crons.
import { createClient } from '@supabase/supabase-js';
import { notifyUsers, sendEmail } from '../_lib/email.js';

export default async function handler(req, res) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET || ''}` || !process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Not authorized.' });
  }
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: 'Server is not configured. Please try again.' });

  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const start = new Date(Date.now() + 23 * 3600000).toISOString();
    const end = new Date(Date.now() + 25 * 3600000).toISOString();
    const { data: sessions } = await admin.from('sessions').select('id,class_id,title,start_at').is('deleted_at', null).gte('start_at', start).lte('start_at', end).limit(200);
    let notified = 0;
    for (const s of sessions || []) {
      const { data: members } = await admin.from('class_members').select('user_id').eq('class_id', s.class_id).eq('status', 'active');
      const ids = (members || []).map((m) => m.user_id);
      notified += await notifyUsers(admin, {
        user_ids: ids, type: 'session_reminder', title: `Starting soon: ${s.title}`,
        body: new Date(s.start_at).toLocaleString(), link: `/dashboard.html?tab=classes&class=${s.class_id}`,
      });
      sendEmail(admin, ids, `Reminder: ${s.title}`, `Session starting soon: ${s.title}`, `<p><b>${s.title}</b> — ${new Date(s.start_at).toLocaleString()}</p>`).catch(() => {});
    }
    return res.status(200).json({ ok: true, notified });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
