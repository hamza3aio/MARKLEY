// POST /api/ai/quiz — generate a quiz draft (not saved). Any active user.
// Body: { subject, topic, difficulty, count, kinds[], class_id? }
import { authContext, activeMembership } from '../_lib/auth.js';
import { aiConfig, generateQuiz, logAI } from '../_lib/ai.js';

const DIFF = ['easy', 'medium', 'hard'];
const KINDS = ['mcq', 'short', 'essay'];

function cleanQuestions(qs, max) {
  const out = [];
  for (const q of Array.isArray(qs) ? qs : []) {
    if (out.length >= max) break;
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
  const { user, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const cfg = aiConfig();
  if (cfg.error) return res.status(503).json({ error: cfg.error });

  const { subject, topic, difficulty = 'medium', count = 5, kinds = ['mcq'], class_id } = req.body || {};
  if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 80) {
    return res.status(400).json({ error: 'Subject is required.' });
  }
  if (typeof topic !== 'string' || !topic.trim() || topic.trim().length > 300) {
    return res.status(400).json({ error: 'Topic is required (max 300 chars).' });
  }
  if (!DIFF.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  const ks = (Array.isArray(kinds) ? kinds : []).filter((k) => KINDS.includes(k)).slice(0, 3);
  if (!ks.length) return res.status(400).json({ error: 'Pick at least one question type.' });
  if (class_id) {
    if (typeof class_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const m = await activeMembership(admin, class_id, user.id);
    if (!m) return res.status(403).json({ error: 'You are not in this class.' });
  }

  try {
    const { data, prompt_tokens, completion_tokens } = await generateQuiz(cfg, {
      subject: subject.trim(), topic: topic.trim(), difficulty, count: n, kinds: ks,
    });
    const questions = cleanQuestions(data.questions, n);
    if (!questions.length) return res.status(502).json({ error: 'AI returned no usable questions. Please try again.' });
    await logAI(admin, { user_id: user.id, kind: 'quiz', provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
    return res.status(200).json({
      draft: { title: String(data.title || `${subject} quiz`).slice(0, 200), topic: topic.trim(), difficulty, questions },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI request failed. Please try again.' });
  }
}
