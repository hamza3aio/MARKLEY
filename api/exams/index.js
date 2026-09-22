// /api/exams — GET list (any active user) with search + filters + pagination.
// POST create (exams.manage). Question paper attached after creation via upload-url.
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from './_lib/auth.js';

const SESSIONS = ['Feb/March', 'May/June', 'Oct/Nov'];

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const { subject, board, year, session, paper, search, limit = '25', offset = '0' } = req.query || {};
    const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    let q = admin.from('exams').select('*', { count: 'exact' }).order('year', { ascending: false }).order('created_at', { ascending: false }).range(off, off + lim - 1);
    if (typeof subject === 'string' && subject) q = q.eq('subject_code', subject);
    if (typeof board === 'string' && board) q = q.eq('board_code', board);
    const yr = parseInt(year, 10);
    if (Number.isInteger(yr)) q = q.eq('year', yr);
    if (typeof session === 'string' && SESSIONS.includes(session)) q = q.eq('session', session);
    if (typeof paper === 'string' && paper) q = q.ilike('paper', `%${paper.slice(0, 60)}%`);
    if (typeof search === 'string' && search.trim()) {
      const s = search.trim().slice(0, 80);
      q = q.or(`title.ilike.%${s}%,paper.ilike.%${s}%`);
    }
    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const canManage = isAdmin(profile) || hasPerm(permissions, 'exams.manage');
    return res.status(200).json({
      exams: (data || []).map((e) => ({ ...e, question_path: undefined, markscheme_path: undefined })),
      total: count ?? 0, canManage,
    });
  }

  if (req.method === 'POST') {
    if (!isAdmin(profile) && !hasPerm(permissions, 'exams.manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    }
    const { subject_code, board_code, year, session, paper, title = '' } = req.body || {};
    const { data: subj } = await admin.from('subjects').select('code').eq('code', subject_code).single();
    if (!subj) return res.status(400).json({ error: 'Invalid subject.' });
    const { data: brd } = await admin.from('exam_boards').select('code').eq('code', board_code).single();
    if (!brd) return res.status(400).json({ error: 'Invalid exam board.' });
    const yr = Number(year);
    if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) return res.status(400).json({ error: 'Invalid year.' });
    if (!SESSIONS.includes(session)) return res.status(400).json({ error: 'Invalid session.' });
    if (typeof paper !== 'string' || !paper.trim() || paper.trim().length > 60) {
      return res.status(400).json({ error: 'Paper is required (max 60 chars).' });
    }
    if (typeof title !== 'string' || title.length > 200) return res.status(400).json({ error: 'Title is too long.' });
    const { data, error } = await admin.from('exams').insert({
      subject_code, board_code, year: yr, session, paper: paper.trim(), title: title.trim(), created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'exam.create', target_type: 'exam', target_id: data.id, metadata: { subject_code, board_code, year: yr }, ip: clientIp(req) });
    return res.status(201).json({ exam: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
