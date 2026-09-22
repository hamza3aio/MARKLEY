// /api/exams/:id — GET detail with signed URLs (any active user).
// PATCH/DELETE (exams.manage). Mark-scheme changes are activity-logged.
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../_lib/auth.js';
import { PURPOSE, signedDownload, objectExists } from '../_lib/files.js';

const SESSIONS = ['Feb/March', 'May/June', 'Oct/Nov'];

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: exam } = await admin.from('exams').select('*').eq('id', id).single();
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const manager = isAdmin(profile) || hasPerm(permissions, 'exams.manage');

  if (req.method === 'GET') {
    const { data: resources } = await admin.from('exam_resources').select('*').eq('exam_id', id).order('created_at', { ascending: true });
    const withUrls = await Promise.all((resources || []).map(async (r) => ({
      ...r, storage_path: undefined, downloadUrl: await signedDownload(admin, PURPOSE.exam_resource.bucket, r.storage_path),
    })));
    return res.status(200).json({
      exam: { ...exam, question_path: undefined, markscheme_path: undefined },
      questionUrl: exam.question_path ? await signedDownload(admin, PURPOSE.exam_question.bucket, exam.question_path) : null,
      markschemeUrl: exam.markscheme_path ? await signedDownload(admin, PURPOSE.exam_question.bucket, exam.markscheme_path) : null,
      resources: withUrls,
      canManage: manager,
    });
  }

  if (req.method === 'PATCH') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    const { subject_code, board_code, year, session, paper, title, question, markscheme } = req.body || {};
    const patch = {};
    if (subject_code !== undefined) {
      const { data: s } = await admin.from('subjects').select('code').eq('code', subject_code).single();
      if (!s) return res.status(400).json({ error: 'Invalid subject.' });
      patch.subject_code = subject_code;
    }
    if (board_code !== undefined) {
      const { data: b } = await admin.from('exam_boards').select('code').eq('code', board_code).single();
      if (!b) return res.status(400).json({ error: 'Invalid exam board.' });
      patch.board_code = board_code;
    }
    if (year !== undefined) {
      const yr = Number(year);
      if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) return res.status(400).json({ error: 'Invalid year.' });
      patch.year = yr;
    }
    if (session !== undefined) {
      if (!SESSIONS.includes(session)) return res.status(400).json({ error: 'Invalid session.' });
      patch.session = session;
    }
    if (paper !== undefined) {
      if (typeof paper !== 'string' || !paper.trim() || paper.trim().length > 60) return res.status(400).json({ error: 'Invalid paper.' });
      patch.paper = paper.trim();
    }
    if (title !== undefined) {
      if (typeof title !== 'string' || title.length > 200) return res.status(400).json({ error: 'Title is too long.' });
      patch.title = title.trim();
    }
    // { path, name } refs from /api/exams/upload-url (prefix-validated below).
    for (const [key, field, nameField] of [['question', 'question_path', 'question_name'], ['markscheme', 'markscheme_path', 'markscheme_name']]) {
      const ref = { question, markscheme }[key];
      if (ref !== undefined) {
        if (ref === null) { patch[field] = null; patch[nameField] = ''; }
        else {
          if (typeof ref?.path !== 'string' || !ref.path.startsWith(`exams/${id}/`) || typeof ref?.name !== 'string') {
            return res.status(400).json({ error: 'Invalid file reference.' });
          }
          if (!(await objectExists(admin, PURPOSE.exam_question.bucket, ref.path))) {
            return res.status(400).json({ error: 'Upload not found. Please upload the file first.' });
          }
          patch[field] = ref.path; patch[nameField] = ref.name.trim().slice(0, 255);
        }
      }
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('exams').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, {
      actor_id: user.id, actor_role: profile.role,
      action: patch.markscheme_path !== undefined ? 'markscheme.change' : 'exam.update',
      target_type: 'exam', target_id: id, metadata: { fields: Object.keys(patch) }, ip: clientIp(req),
    });
    return res.status(200).json({ exam: data });
  }

  if (req.method === 'DELETE') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    const { data: resources } = await admin.from('exam_resources').select('storage_path').eq('exam_id', id);
    const paths = [...(resources || []).map((r) => r.storage_path), exam.question_path, exam.markscheme_path].filter(Boolean);
    if (paths.length) await admin.storage.from(PURPOSE.exam_question.bucket).remove(paths);
    await admin.from('exams').delete().eq('id', id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'exam.delete', target_type: 'exam', target_id: id, metadata: {}, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
