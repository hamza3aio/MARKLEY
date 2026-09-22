// /api/exams/meta — GET boards + subjects. POST add board/subject (exams.manage).
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const [{ data: boards }, { data: subjects }] = await Promise.all([
      admin.from('exam_boards').select('*').order('name'),
      admin.from('subjects').select('*').order('name'),
    ]);
    return res.status(200).json({ boards: boards || [], subjects: subjects || [] });
  }

  if (req.method === 'POST') {
    if (!isAdmin(profile) && !hasPerm(permissions, 'exams.manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    }
    const { kind, code, name } = req.body || {};
    if (!['board', 'subject'].includes(kind)) return res.status(400).json({ error: 'Invalid request.' });
    if (typeof code !== 'string' || !/^[a-z0-9_]{2,30}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Code must be 2-30 lowercase letters, numbers or _.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be 2-80 characters.' });
    }
    const table = kind === 'board' ? 'exam_boards' : 'subjects';
    const { data, error } = await admin.from(table).insert({ code: code.trim(), name: name.trim() }).select().single();
    if (error) return res.status(409).json({ error: 'This code already exists.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'exam.update', target_type: table, target_id: code.trim(), metadata: { name: name.trim() }, ip: clientIp(req) });
    return res.status(201).json({ item: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
