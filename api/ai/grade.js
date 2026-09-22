// POST /api/ai/grade — suggest a grade for one submission (staff, assignment.grade).
// Stores a pending suggestion; NEVER writes a final grade.
import { authContext, hasPerm, isAdmin, activeMembership } from '../_lib/auth.js';
import { aiConfig, suggestGrade, logAI } from '../_lib/ai.js';
import { checkAIGate } from '../_lib/plans.js';
import { rateLimit } from '../_lib/rate.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const cfg = aiConfig();
  if (cfg.error) return res.status(503).json({ error: cfg.error });
  if (rateLimit(req, res, { max: 20, prefix: 'ai-grade' })) return;
  if (await checkAIGate(admin, profile, user, res)) return;

  const { assignment_id, student_id } = req.body || {};
  if (typeof assignment_id !== 'string' || typeof student_id !== 'string') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const { data: asg } = await admin.from('assignments').select('id,class_id,title,max_points').eq('id', assignment_id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id,subject').eq('id', asg.class_id).single();
  const member = await activeMembership(admin, asg.class_id, user.id);
  const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!staff || (!hasPerm(permissions, 'assignment.grade') && !isAdmin(profile) && cls?.teacher_id !== user.id)) {
    return res.status(403).json({ error: 'You do not have permission to grade.' });
  }
  const { data: sub } = await admin.from('assignment_submissions').select('id,text_content').eq('assignment_id', assignment_id).eq('student_id', student_id).single();
  if (!sub) return res.status(404).json({ error: 'No submission from this student yet.' });
  const { data: files } = await admin.from('submission_files').select('name').eq('submission_id', sub.id);

  try {
    const { data, prompt_tokens, completion_tokens } = await suggestGrade(cfg, {
      subject: cls?.subject || '', title: asg.title, max_points: asg.max_points,
      answer: (sub.text_content || '').slice(0, 8000),
      files: (files || []).map((f) => f.name),
    });
    const score = Math.min(Math.max(Number(data.suggested_score) || 0, 0), asg.max_points);
    const { data: sug, error } = await admin.from('ai_grading_suggestions').insert({
      assignment_id, student_id, submission_id: sub.id,
      suggested_score: Math.round(score * 100) / 100,
      suggested_feedback: String(data.suggested_feedback || '').slice(0, 2000),
      criteria: String(data.criteria || '').slice(0, 2000),
      confidence: ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : 'medium',
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logAI(admin, { user_id: user.id, kind: 'grade', provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
    return res.status(201).json({ suggestion: sug });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI request failed. Please try again.' });
  }
}
