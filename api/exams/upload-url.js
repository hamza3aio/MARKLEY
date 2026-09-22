// POST /api/exams/upload-url — mint signed upload URL (exams.manage only).
// Body: { exam_id, kind: question|markscheme|resource, name, mime, size }
import { authContext, hasPerm, isAdmin } from '../_lib/auth.js';
import { PURPOSE, validateFile, buildPath, signedUpload } from '../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { profile, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isAdmin(profile) && !hasPerm(ctx.permissions, 'exams.manage')) {
    return res.status(403).json({ error: 'You do not have permission to manage exams.' });
  }
  const { exam_id, kind, name, mime, size } = req.body || {};
  if (typeof exam_id !== 'string' || !['question', 'markscheme', 'resource'].includes(kind)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const { data: exam } = await admin.from('exams').select('id').eq('id', exam_id).single();
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  const purpose = kind === 'resource' ? 'exam_resource' : 'exam_question';
  const err = validateFile(purpose, name, mime, size);
  if (err) return res.status(400).json({ error: err });
  const path = buildPath(`exams/${exam_id}/${kind}`, name);
  const up = await signedUpload(admin, PURPOSE[purpose].bucket, path).catch(() => null);
  if (!up) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return res.status(200).json({ bucket: PURPOSE[purpose].bucket, path, signedUrl: up.signedUrl, token: up.token });
}
