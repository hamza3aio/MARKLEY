// GET /api/calendar?from=ISO&to=ISO — unified feed for the caller's classes:
// live sessions + manual events + published assignment due dates.
import { authContext, isAdmin, activeMembership } from './_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const now = new Date();
  const from = new Date(req.query?.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
  const to = new Date(req.query?.to || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Invalid date range.' });
  }

  let classIds = [];
  if (isAdmin(profile)) {
    const { data } = await admin.from('classes').select('id').is('deleted_at', null).limit(500);
    classIds = (data || []).map((c) => c.id);
  } else if (profile.role === 'parent') {
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    const sids = (links || []).map((l) => l.student_id);
    if (sids.length) {
      const { data: ms } = await admin.from('class_members').select('class_id').in('user_id', sids).eq('status', 'active');
      classIds = [...new Set((ms || []).map((m) => m.class_id))];
    }
  } else {
    const { data: ms } = await admin.from('class_members').select('class_id').eq('user_id', user.id).eq('status', 'active');
    classIds = [...new Set((ms || []).map((m) => m.class_id))];
  }
  if (!classIds.length) return res.status(200).json({ items: [] });

  const { data: classes } = await admin.from('classes').select('id,name').in('id', classIds);
  const names = Object.fromEntries((classes || []).map((c) => [c.id, c.name]));
  const items = [];

  const { data: sessions } = await admin.from('sessions').select('id,class_id,title,start_at,end_at,meeting_url').in('class_id', classIds).is('deleted_at', null).gte('start_at', from.toISOString()).lte('start_at', to.toISOString()).limit(500);
  (sessions || []).forEach((s) => items.push({ kind: 'session', id: s.id, class_id: s.class_id, class_name: names[s.class_id] || '', title: s.title, start: s.start_at, end: s.end_at, link: s.meeting_url || '' }));

  const { data: events } = await admin.from('calendar_events').select('id,class_id,title,type,start_at,end_at,link').in('class_id', classIds).gte('start_at', from.toISOString()).lte('start_at', to.toISOString()).limit(500);
  (events || []).forEach((e) => items.push({ kind: e.type === 'exam' ? 'exam' : 'event', id: e.id, class_id: e.class_id, class_name: names[e.class_id] || '', title: e.title, start: e.start_at, end: e.end_at, link: e.link || '' }));

  const { data: asgs } = await admin.from('assignments').select('id,class_id,title,due_date').in('class_id', classIds).is('deleted_at', null).eq('status', 'published').not('due_date', 'is', null).gte('due_date', from.toISOString()).lte('due_date', to.toISOString()).limit(500);
  (asgs || []).forEach((a) => items.push({ kind: 'deadline', id: a.id, class_id: a.class_id, class_name: names[a.class_id] || '', title: `Due: ${a.title}`, start: a.due_date, end: a.due_date, link: '' }));

  items.sort((x, y) => new Date(x.start) - new Date(y.start));
  return res.status(200).json({ items: items.slice(0, 1000) });
}
