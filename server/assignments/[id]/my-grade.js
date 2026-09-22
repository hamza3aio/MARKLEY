// /api/assignments/:id/my-grade — GET the caller's own grade + feedback.
import { authContext, activeMembership } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('id,class_id,status').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const member = await activeMembership(admin, asg.class_id, user.id);
  if (!member || member.role_in_class !== 'student') {
    return res.status(403).json({ error: 'Only enrolled students can view grades.' });
  }
  const { data: grade } = await admin.from('grades').select('score,max_points,feedback,grading_source,updated_at').eq('assignment_id', id).eq('student_id', user.id).single();
  return res.status(200).json({ grade: grade || null });
}
