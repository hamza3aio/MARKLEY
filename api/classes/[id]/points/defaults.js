// /api/classes/:id/points/defaults — POST restore missing default rules (owner/admin).
import { authContext, isAdmin } from '../../../_lib/auth.js';
import { seedDefaultRules } from '../../../_lib/points.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  if (!isAdmin(profile) && cls.teacher_id !== user.id) {
    return res.status(403).json({ error: 'Only the class teacher can manage point rules.' });
  }
  await seedDefaultRules(admin, id, user.id);
  const { data } = await admin.from('point_rules').select('*').eq('class_id', id).order('created_at', { ascending: true });
  return res.status(200).json({ rules: data || [] });
}
