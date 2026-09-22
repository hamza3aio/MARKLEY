// /api/sessions/:id — GET, PATCH, DELETE (creator, owner teacher, or admin).
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';

const PROVIDERS = ['zoom', 'teams', 'meet', 'other'];

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: s } = await admin.from('sessions').select('*').eq('id', id).is('deleted_at', null).single();
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', s.class_id).single();
  const member = await activeMembership(admin, s.class_id, user.id);
  if (!member && !isAdmin(profile)) return res.status(403).json({ error: 'You do not have access to this session.' });

  const manager = isAdmin(profile) || cls?.teacher_id === user.id || s.created_by === user.id;
  if (req.method === 'GET') return res.status(200).json({ session: s });

  if (req.method === 'PATCH') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to edit this session.' });
    const { title, description, start_at, end_at, meeting_url, provider } = req.body || {};
    const patch = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) return res.status(400).json({ error: 'Title must be 3-200 characters.' });
      patch.title = title.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 2000) return res.status(400).json({ error: 'Description is too long.' });
      patch.description = description.trim();
    }
    if (start_at !== undefined || end_at !== undefined) {
      const start = new Date(start_at ?? s.start_at), end = new Date(end_at ?? s.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ error: 'Invalid session time.' });
      patch.start_at = start.toISOString(); patch.end_at = end.toISOString();
    }
    if (meeting_url !== undefined) {
      if (typeof meeting_url !== 'string' || meeting_url.length > 2000) return res.status(400).json({ error: 'Invalid meeting link.' });
      if (meeting_url && !/^https:\/\//i.test(meeting_url.trim())) return res.status(400).json({ error: 'Meeting link must start with https://.' });
      patch.meeting_url = meeting_url.trim();
    }
    if (provider !== undefined) {
      if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Invalid provider.' });
      patch.provider = provider;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('sessions').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'session.update', target_type: 'session', target_id: id, metadata: {}, ip: clientIp(req) });
    return res.status(200).json({ session: data });
  }

  if (req.method === 'DELETE') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to delete this session.' });
    await admin.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'session.delete', target_type: 'session', target_id: id, metadata: {}, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
