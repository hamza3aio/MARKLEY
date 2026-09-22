// /api/quizzes — GET mine (personal + class), POST save draft (manual or AI-reviewed).
// Student-saved quizzes are personal-only unless a teacher publishes them to a class.
import { authContext, hasPerm, isAdmin, activeMembership } from './_lib/auth.js';

const KINDS = ['mcq', 'short', 'essay'];

function cleanQuestions(qs) {
  const out = [];
  for (const q of Array.isArray(qs) ? qs : []) {
    if (out.length >= 20) break;
    if (!q || typeof q.prompt !== 'string' || !q.prompt.trim() || !KINDS.includes(q.kind)) continue;
    const pts = Math.min(Math.max(parseInt(q.points, 10) || 10, 1), 100);
    if (q.kind === 'mcq') {
      const opts = (Array.isArray(q.options) ? q.options : []).map(String).map((s) => s.slice(0, 500)).filter(Boolean).slice(0, 6);
      if (opts.length < 2 || typeof q.answer !== 'string' || !opts.includes(q.answer)) continue;
      out.push({ kind: 'mcq', prompt: q.prompt.trim().slice(0, 3000), options: opts, answer: q.answer, points: pts });
    } else {
      out.push({ kind: q.kind, prompt: q.prompt.trim().slice(0, 3000), options: [], answer: String(q.answer || '').slice(0, 2000), points: pts });
    }
  }
  return out;
}

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const { data: memberships } = await admin.from('class_members').select('class_id').eq('user_id', user.id).eq('status', 'active');
    const cids = [...new Set((memberships || []).map((m) => m.class_id))];
    let personal = [], classQ = [];
    const p = await admin.from('quizzes').select('id,title,topic,difficulty,source,status,class_id,created_at').is('class_id', null).eq('created_by', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(100);
    personal = p.data || [];
    if (cids.length) {
      const q = await admin.from('quizzes').select('id,title,topic,difficulty,source,status,class_id,created_at').in('class_id', cids).is('deleted_at', null).eq('status', 'published').order('created_at', { ascending: false }).limit(200);
      classQ = q.data || [];
      if (profile.role === 'teacher' || profile.role === 'assistant' || isAdmin(profile)) {
        const mine = await admin.from('quizzes').select('id,title,topic,difficulty,source,status,class_id,created_at').in('class_id', cids).is('deleted_at', null).neq('status', 'published').eq('created_by', user.id).limit(100);
        classQ = classQ.concat(mine.data || []);
      }
    }
    return res.status(200).json({ personal, class: classQ });
  }

  if (req.method === 'POST') {
    const { title, topic = '', difficulty = 'medium', source = 'manual', class_id = null, status = 'personal', questions } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 3-200 characters.' });
    }
    if (typeof topic !== 'string' || topic.length > 300) return res.status(400).json({ error: 'Topic is too long.' });
    if (!['easy', 'medium', 'hard'].includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
    if (!['manual', 'ai'].includes(source)) return res.status(400).json({ error: 'Invalid source.' });
    const qs = cleanQuestions(questions);
    if (!qs.length) return res.status(400).json({ error: 'Add at least one valid question.' });

    let cid = null, st = 'personal';
    if (class_id) {
      // Only teachers/admins may attach quizzes to a class.
      if (typeof class_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
      const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', class_id).single();
      if (!cls) return res.status(404).json({ error: 'Class not found.' });
      if (!isAdmin(profile) && cls.teacher_id !== user.id && !hasPerm(permissions, 'assignment.create')) {
        return res.status(403).json({ error: 'Only the class teacher can add class quizzes.' });
      }
      cid = class_id;
      st = status === 'published' ? 'published' : 'draft';
    }
    const { data: quiz, error } = await admin.from('quizzes').insert({
      class_id: cid, title: title.trim(), topic: topic.trim(), difficulty, source, status: st, created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const rows = qs.map((q, i) => ({ ...q, quiz_id: quiz.id, position: i }));
    await admin.from('quiz_questions').insert(rows);
    return res.status(201).json({ quiz });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
