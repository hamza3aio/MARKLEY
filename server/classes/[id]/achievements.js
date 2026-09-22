// /api/classes/:id/achievements — GET catalogue with earned flags + totals.
// Students/parents see scoped rows; staff see all (optional ?student_id=).
import { authContext, isAdmin, activeMembership } from '../../_lib/auth.js';
import { classTotal } from '../../_lib/points.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile) && profile.role !== 'parent') {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  const { data: catalogue } = await admin.from('achievements').select('*');
  let targetIds;
  if (staff) {
    const q = typeof req.query?.student_id === 'string' ? [req.query.student_id] : null;
    if (q) targetIds = q;
    else {
      const { data: students } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active').limit(500);
      targetIds = (students || []).map((s) => s.user_id);
    }
  } else if (member?.role_in_class === 'student') {
    targetIds = [user.id];
  } else {
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    targetIds = (links || []).map((l) => l.student_id);
  }

  const { data: earned } = targetIds.length
    ? await admin.from('student_achievements').select('achievement_code,user_id,awarded_at').eq('class_id', id).in('user_id', targetIds).limit(500)
    : { data: [] };
  const byUser = {};
  (earned || []).forEach((e) => { (byUser[e.user_id] = byUser[e.user_id] || []).push(e); });
  const totals = {};
  for (const sid of targetIds) totals[sid] = await classTotal(admin, id, sid);

  return res.status(200).json({
    catalogue: catalogue || [],
    users: targetIds.map((sid) => ({ user_id: sid, total: totals[sid] || 0, earned: byUser[sid] || [] })),
  });
}
