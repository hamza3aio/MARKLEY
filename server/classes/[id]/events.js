// /api/classes/:id/events — GET manual events, POST create (staff).
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';

const TYPES = ['event', 'exam', 'deadline'];

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile) && profile.role !== 'parent') {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.from('calendar_events').select('*').eq('class_id', id).order('start_at', { ascending: true }).limit(200);
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ events: data || [] });
  }

  if (req.method === 'POST') {
    if (!staff) return res.status(403).json({ error: 'Only class staff can create events.' });
    const { title, description = '', type = 'event', start_at, end_at = null, link = '' } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 3-200 characters.' });
    }
    if (typeof description !== 'string' || description.length > 2000) return res.status(400).json({ error: 'Description is too long.' });
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid event type.' });
    const start = new Date(start_at);
    if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start time.' });
    let end = null;
    if (end_at) {
      end = new Date(end_at);
      if (Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ error: 'Invalid end time.' });
      end = end.toISOString();
    }
    if (typeof link !== 'string' || link.length > 2000) return res.status(400).json({ error: 'Invalid link.' });
    const { data, error } = await admin.from('calendar_events').insert({
      class_id: id, title: title.trim(), description: description.trim(), type,
      start_at: start.toISOString(), end_at: end, link: link.trim(), created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'event.create', target_type: 'class', target_id: id, metadata: { event_id: data.id }, ip: clientIp(req) });
    return res.status(201).json({ event: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
