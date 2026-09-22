// /api/classes/:id/points/reset — POST reset ledger (owner teacher or admin).
// Body: { user_id? } — omit to reset the whole class.
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../../_lib/auth.js';

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
    return res.status(403).json({ error: 'Only the class teacher can reset points.' });
  }
  const { user_id } = req.body || {};
  let q = admin.from('points').delete().eq('class_id', id);
  if (user_id) {
    if (typeof user_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    q = q.eq('user_id', user_id);
  }
  const { error } = await q;
  if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'points.reset', target_type: 'class', target_id: id, metadata: user_id ? { user_id } : { all: true }, ip: clientIp(req) });
  return res.status(200).json({ ok: true });
}
