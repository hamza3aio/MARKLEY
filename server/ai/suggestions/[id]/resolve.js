// POST /api/ai/suggestions/:id/resolve — approve | modify | reject a suggestion.
// approve → grade (ai_approved); modify (+score+feedback) → grade (ai_modified);
// reject → no grade change. Teacher decision is always explicit.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: sug } = await admin.from('ai_grading_suggestions').select('*').eq('id', id).single();
  if (!sug) return res.status(404).json({ error: 'Suggestion not found.' });
  if (sug.status !== 'pending') return res.status(409).json({ error: `Suggestion is already ${sug.status}.` });
  const { data: asg } = await admin.from('assignments').select('id,class_id,max_points').eq('id', sug.assignment_id).single();
  const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', asg.class_id).single();
  const member = await activeMembership(admin, asg.class_id, user.id);
  const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!staff || (!hasPerm(permissions, 'assignment.grade') && !isAdmin(profile) && cls?.teacher_id !== user.id)) {
    return res.status(403).json({ error: 'You do not have permission to grade.' });
  }

  const { decision, score, feedback = '' } = req.body || {};
  if (!['approve', 'modify', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approve, modify or reject.' });
  }

  if (decision === 'reject') {
    await admin.from('ai_grading_suggestions').update({ status: 'rejected', resolved_by: user.id, resolved_at: new Date().toISOString() }).eq('id', id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'ai.suggestion_reject', target_type: 'assignment', target_id: asg.id, metadata: { suggestion_id: id }, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  let final, source;
  if (decision === 'approve') {
    final = { score: sug.suggested_score, feedback: sug.suggested_feedback };
    source = 'ai_approved';
  } else {
    const num = Number(score);
    if (!Number.isFinite(num) || num < 0 || num > asg.max_points) {
      return res.status(400).json({ error: `Score must be 0–${asg.max_points}.` });
    }
    if (typeof feedback !== 'string' || feedback.length > 2000) return res.status(400).json({ error: 'Feedback is too long.' });
    final = { score: Math.round(num * 100) / 100, feedback: feedback.trim() };
    source = 'ai_modified';
  }
  await admin.from('grades').upsert({
    assignment_id: asg.id, student_id: sug.student_id, score: final.score, max_points: asg.max_points,
    feedback: final.feedback, graded_by: user.id, grading_source: source,
  }, { onConflict: 'assignment_id,student_id' });
  await admin.from('assignment_submissions').update({ status: 'graded' }).eq('assignment_id', asg.id).eq('student_id', sug.student_id);
  await admin.from('ai_grading_suggestions').update({ status: decision === 'approve' ? 'approved' : 'modified', resolved_by: user.id, resolved_at: new Date().toISOString() }).eq('id', id);
  await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'grade.change', target_type: 'assignment', target_id: asg.id, metadata: { student_id: sug.student_id, source }, ip: clientIp(req) });
  return res.status(200).json({ ok: true, source });
}
