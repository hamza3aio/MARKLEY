// /api/classes/:id/points/award — POST manual award (owner teacher or admin).
// Body: { user_id, rule_id? | points?, reason? }
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../../_lib/auth.js';
import { classTotal, maybeAchievements } from '../../../_lib/points.js';

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
    return res.status(403).json({ error: 'Only the class teacher can award points.' });
  }

  const { user_id, rule_id, points, reason = '' } = req.body || {};
  if (typeof user_id !== 'string') return res.status(400).json({ error: 'Invalid student.' });
  const member = await activeMembership(admin, id, user_id);
  if (!member || member.role_in_class !== 'student') {
    return res.status(400).json({ error: 'User is not an active student in this class.' });
  }
  if (typeof reason !== 'string' || reason.length > 300) return res.status(400).json({ error: 'Reason is too long.' });

  let pts, rid = null;
  if (rule_id) {
    const { data: rule } = await admin.from('point_rules').select('id,points,active').eq('id', rule_id).eq('class_id', id).single();
    if (!rule || !rule.active) return res.status(400).json({ error: 'Rule not found or disabled.' });
    pts = rule.points; rid = rule.id;
  } else {
    pts = Number(points);
    if (!Number.isInteger(pts) || pts < -1000 || pts > 1000 || pts === 0) {
      return res.status(400).json({ error: 'Points must be a non-zero integer.' });
    }
  }

  const { error } = await admin.from('points').insert({
    class_id: id, user_id, rule_id: rid, points: pts, reason: reason.trim(), awarded_by: user.id,
  });
  if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  const total = await classTotal(admin, id, user_id);
  await maybeAchievements(admin, id, user_id, total);
  await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'points.award', target_type: 'class', target_id: id, metadata: { user_id, points: pts }, ip: clientIp(req) });
  return res.status(201).json({ ok: true, total });
}
