// POST /api/ai/assignment — generate an assignment draft for teachers (never auto-published).
// Body: { subject, topic, difficulty, instructions, count, type }
import { authContext, hasPerm, isAdmin } from '../_lib/auth.js';
import { aiConfig, generateAssignment, logAI } from '../_lib/ai.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isAdmin(profile) && !hasPerm(permissions, 'assignment.create')) {
    return res.status(403).json({ error: 'Only teachers can use the assignment generator.' });
  }
  const cfg = aiConfig();
  if (cfg.error) return res.status(503).json({ error: cfg.error });

  const { subject, topic, difficulty = 'medium', instructions = '', count = 5, type = 'normal' } = req.body || {};
  if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 80) {
    return res.status(400).json({ error: 'Subject is required.' });
  }
  if (typeof topic !== 'string' || !topic.trim() || topic.trim().length > 300) {
    return res.status(400).json({ error: 'Topic is required (max 300 chars).' });
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
  if (typeof instructions !== 'string' || instructions.length > 2000) return res.status(400).json({ error: 'Instructions are too long.' });
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  if (!['guided', 'normal'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });

  try {
    const { data, prompt_tokens, completion_tokens } = await generateAssignment(cfg, {
      subject: subject.trim(), topic: topic.trim(), difficulty, instructions: instructions.trim(), count: n, type,
    });
    await logAI(admin, { user_id: user.id, kind: 'assignment', provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
    return res.status(200).json({
      draft: {
        title: String(data.title || '').slice(0, 200),
        description: String(data.description || '').slice(0, 5000),
        instructions: String(data.instructions || '').slice(0, 5000),
        type,
      },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'AI request failed. Please try again.' });
  }
}
