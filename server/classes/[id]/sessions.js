// /api/classes/:id/sessions — GET list, POST create (staff). Notifies members + email.
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';
import { notifyUsers, sendEmail, appLink } from '../../_lib/email.js';
import { requireFlag, sendPlanError } from '../../_lib/plans.js';

const PROVIDERS = ['zoom', 'teams', 'meet', 'other'];

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,name,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  try {
    await requireFlag(admin, profile, 'sessions');
  } catch (e) {
    if (sendPlanError(res, e)) return;
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile)) {
    if (profile.role !== 'parent') return res.status(403).json({ error: 'You do not have access to this class.' });
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    const sids = (links || []).map((l) => l.student_id);
    let ok = false;
    if (sids.length) {
      const { data: m } = await admin.from('class_members').select('id').eq('class_id', id).in('user_id', sids).eq('status', 'active').limit(1);
      ok = !!(m && m.length);
    }
    if (!ok) return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  if (req.method === 'GET') {
    const upcoming = req.query?.upcoming === '1';
    let q = admin.from('sessions').select('*').eq('class_id', id).is('deleted_at', null).order('start_at', { ascending: true }).limit(200);
    if (upcoming) q = q.gte('start_at', new Date().toISOString());
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ sessions: data || [] });
  }

  if (req.method === 'POST') {
    if (!staff) return res.status(403).json({ error: 'Only class staff can create sessions.' });
    const { title, description = '', start_at, end_at, meeting_url = '', provider = 'other' } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 3-200 characters.' });
    }
    if (typeof description !== 'string' || description.length > 2000) return res.status(400).json({ error: 'Description is too long.' });
    const start = new Date(start_at), end = new Date(end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Invalid session time.' });
    }
    if (typeof meeting_url !== 'string' || meeting_url.length > 2000) return res.status(400).json({ error: 'Invalid meeting link.' });
    if (meeting_url && !/^https:\/\//i.test(meeting_url.trim())) return res.status(400).json({ error: 'Meeting link must start with https://.' });
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Invalid provider.' });

    const { data, error } = await admin.from('sessions').insert({
      class_id: id, title: title.trim(), description: description.trim(),
      start_at: start.toISOString(), end_at: end.toISOString(),
      meeting_url: meeting_url.trim(), provider, created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

    const { data: members } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('status', 'active');
    const ids = (members || []).map((m) => m.user_id).filter((x) => x !== user.id);
    const link = appLink(`/dashboard.html?tab=classes&class=${id}`);
    await notifyUsers(admin, { user_ids: ids, type: 'session', title: `New session: ${data.title}`, body: `${cls.name} · ${start.toLocaleString()}`, link });
    sendEmail(admin, ids, `New session: ${data.title}`, `New live session in ${cls.name}`, `<p><b>${data.title}</b> — ${start.toLocaleString()}</p>`, link).catch(() => {});
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'session.create', target_type: 'class', target_id: id, metadata: { session_id: data.id }, ip: clientIp(req) });
    return res.status(201).json({ session: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
