// /api/quizzes/:id/attempts — GET (staff: all; student: own), POST submit answers.
// MCQ auto-graded; short/essay recorded for teacher review. Perfect MCQ → points.
import { authContext, isAdmin, activeMembership } from '../../_lib/auth.js';
import { awardRule } from '../../_lib/points.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: quiz } = await admin.from('quizzes').select('*').eq('id', id).is('deleted_at', null).single();
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  let teacher = isAdmin(profile) || quiz.created_by === user.id;
  let enrolled = quiz.created_by === user.id;
  if (quiz.class_id) {
    const member = await activeMembership(admin, quiz.class_id, user.id);
    const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', quiz.class_id).single();
    teacher = teacher || cls?.teacher_id === user.id ||
      (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
    enrolled = enrolled || !!member;
    if (quiz.status !== 'published' && !teacher && quiz.created_by !== user.id) {
      return res.status(403).json({ error: 'Quiz is not published.' });
    }
  }
  if (!enrolled && !teacher) return res.status(403).json({ error: 'You do not have access to this quiz.' });

  if (req.method === 'GET') {
    if (teacher) {
      const { data: attempts } = await admin.from('quiz_attempts').select('*').eq('quiz_id', id).order('submitted_at', { ascending: false }).limit(200);
      const sids = [...new Set((attempts || []).map((a) => a.student_id))];
      const { data: profs } = sids.length ? await admin.from('profiles').select('id,full_name,email').in('id', sids) : { data: [] };
      const byId = Object.fromEntries(((profs) || []).map((p) => [p.id, p]));
      return res.status(200).json({ attempts: (attempts || []).map((a) => ({ ...a, student: byId[a.student_id] || null })) });
    }
    const { data: mine } = await admin.from('quiz_attempts').select('*').eq('quiz_id', id).eq('student_id', user.id).order('submitted_at', { ascending: false });
    return res.status(200).json({ attempts: mine || [] });
  }

  if (req.method === 'POST') {
    if (profile.role !== 'student' && quiz.created_by !== user.id && !teacher) {
      return res.status(403).json({ error: 'Only students submit quiz attempts.' });
    }
    const { answers } = req.body || {};
    if (typeof answers !== 'object' || !answers) return res.status(400).json({ error: 'Invalid answers.' });
    const { data: questions } = await admin.from('quiz_questions').select('*').eq('quiz_id', id);
    if (!questions?.length) return res.status(400).json({ error: 'Quiz has no questions.' });

    let score = 0, max = 0, mcqTotal = 0, mcqGot = 0;
    const rows = [];
    for (const q of questions) {
      max += q.points;
      const given = String(answers[q.id] || '').slice(0, 5000);
      if (q.kind === 'mcq') {
        mcqTotal += q.points;
        const ok = given === q.answer;
        if (ok) { score += q.points; mcqGot += q.points; }
        rows.push({ question_id: q.id, answer_text: given, is_correct: ok });
      } else {
        rows.push({ question_id: q.id, answer_text: given, is_correct: null });
      }
    }
    const { data: attempt, error } = await admin.from('quiz_attempts').insert({
      quiz_id: id, student_id: user.id, score, max_points: max, status: 'submitted',
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await admin.from('quiz_answers').insert(rows.map((r) => ({ ...r, attempt_id: attempt.id })));
    if (quiz.class_id && mcqTotal > 0 && mcqGot >= mcqTotal) {
      awardRule(admin, { class_id: quiz.class_id, user_id: user.id, code: 'perfect_score', dedupe_key: `quiz:${id}:${attempt.id}`, awarded_by: null }).catch(() => {});
    }
    return res.status(201).json({ attempt });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
