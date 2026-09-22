// /api/quizzes/:id — GET (access-checked), PATCH publish/edit (owner or class teacher), DELETE.
import { authContext, isAdmin, activeMembership } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: quiz } = await admin.from('quizzes').select('*').eq('id', id).is('deleted_at', null).single();
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  let access = quiz.created_by === user.id || isAdmin(profile);
  let teacher = isAdmin(profile);
  if (quiz.class_id) {
    const member = await activeMembership(admin, quiz.class_id, user.id);
    const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', quiz.class_id).single();
    teacher = teacher || cls?.teacher_id === user.id;
    if (quiz.status === 'published' && member) access = true;
    if (member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant')) access = true;
  }
  if (!access) return res.status(403).json({ error: 'You do not have access to this quiz.' });

  const { data: questions } = await admin.from('quiz_questions').select('*').eq('quiz_id', id).order('position');
  // Hide MCQ answers from students taking a published quiz.
  const taker = !teacher && quiz.created_by !== user.id && quiz.status === 'published';
  const qs = (questions || []).map((q) => (taker && q.kind === 'mcq' ? { ...q, answer: '' } : q));

  if (req.method === 'GET') return res.status(200).json({ quiz, questions: qs, canEdit: quiz.created_by === user.id || teacher });

  if (req.method === 'PATCH') {
    if (quiz.created_by !== user.id && !teacher) return res.status(403).json({ error: 'Only the owner can edit this quiz.' });
    const { title, status } = req.body || {};
    const patch = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) return res.status(400).json({ error: 'Invalid title.' });
      patch.title = title.trim();
    }
    if (status !== undefined) {
      if (quiz.class_id) {
        if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
        if (status === 'published' && !teacher) return res.status(403).json({ error: 'Only the class teacher can publish.' });
        patch.status = status;
      } else if (['personal', 'shared'].includes(status)) {
        patch.status = status;
      } else return res.status(400).json({ error: 'Invalid status.' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('quizzes').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ quiz: data });
  }

  if (req.method === 'DELETE') {
    if (quiz.created_by !== user.id && !teacher) return res.status(403).json({ error: 'Only the owner can delete this quiz.' });
    await admin.from('quizzes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
