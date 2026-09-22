// /api/classes/:id/points/rules — GET rules, POST create (owner teacher or admin).
import { authContext, isAdmin, activeMembership } from '../../../_lib/auth.js';
import { DEFAULT_RULES } from '../../../_lib/points.js';

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
    let q = admin.from('point_rules').select('*').eq('class_id', id).order('created_at', { ascending: true });
    if (!staff) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ rules: data || [], defaults: DEFAULT_RULES });
  }

  if (req.method === 'POST') {
    if (!isAdmin(profile) && cls.teacher_id !== user.id) {
      return res.status(403).json({ error: 'Only the class teacher can define point rules.' });
    }
    const { code, name, points } = req.body || {};
    if (typeof code !== 'string' || !/^[a-z0-9_]{2,40}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Code must be 2-40 lowercase letters, numbers or _.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be 2-80 characters.' });
    }
    const pts = Number(points);
    if (!Number.isInteger(pts) || pts < -1000 || pts > 1000 || pts === 0) {
      return res.status(400).json({ error: 'Points must be a non-zero integer (-1000 to 1000).' });
    }
    const { data, error } = await admin.from('point_rules').insert({
      class_id: id, code: code.trim(), name: name.trim(), points: pts, created_by: user.id,
    }).select().single();
    if (error) return res.status(409).json({ error: 'A rule with this code already exists.' });
    return res.status(201).json({ rule: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
