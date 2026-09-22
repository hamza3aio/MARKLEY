// /api/assignments/:id/grades — GET staff gradebook, POST upsert grade.
// Staff only (assignment.grade): score 0..max_points, feedback. Sets submission graded.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('id,class_id,max_points').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', asg.class_id).single();
  const member = await activeMembership(admin, asg.class_id, user.id);
  const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!staff) return res.status(403).json({ error: 'Only class staff can manage grades.' });
  if (!hasPerm(permissions, 'assignment.grade') && !isAdmin(profile) && cls?.teacher_id !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to grade.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.from('grades').select('*').eq('assignment_id', id);
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ grades: data || [] });
  }

  if (req.method === 'POST') {
    const { student_id, score, feedback = '' } = req.body || {};
    if (typeof student_id !== 'string') return res.status(400).json({ error: 'Invalid student.' });
    const num = Number(score);
    if (!Number.isFinite(num) || num < 0 || num > asg.max_points) {
      return res.status(400).json({ error: `Score must be 0–${asg.max_points}.` });
    }
    if (typeof feedback !== 'string' || feedback.length > 2000) {
      return res.status(400).json({ error: 'Feedback is too long.' });
    }
    // Student must hold an active (or past) membership in the class.
    const { data: mem } = await admin.from('class_members').select('id').eq('class_id', asg.class_id).eq('user_id', student_id).limit(1);
    if (!mem?.length) return res.status(400).json({ error: 'Student is not in this class.' });

    const rounded = Math.round(num * 100) / 100;
    const { error } = await admin.from('grades').upsert({
      assignment_id: id, student_id, score: rounded, max_points: asg.max_points,
      feedback: feedback.trim(), graded_by: user.id, grading_source: 'manual',
    }, { onConflict: 'assignment_id,student_id' });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await admin.from('assignment_submissions').update({ status: 'graded' }).eq('assignment_id', id).eq('student_id', student_id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'grade.change', target_type: 'assignment', target_id: id, metadata: { student_id, score: rounded }, ip: clientIp(req) });
    return res.status(200).json({ ok: true, score: rounded });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
