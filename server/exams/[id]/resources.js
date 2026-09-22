// /api/exams/:id/resources — GET list, POST confirm upload, DELETE remove (write: exams.manage).
import { authContext, hasPerm, isAdmin } from '../../_lib/auth.js';
import { PURPOSE, validateFile, signedDownload, objectExists } from '../../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: exam } = await admin.from('exams').select('id').eq('id', id).single();
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const manager = isAdmin(profile) || hasPerm(permissions, 'exams.manage');
  const prefix = `exams/${id}/resource/`;

  if (req.method === 'GET') {
    const { data, error } = await admin.from('exam_resources').select('*').eq('exam_id', id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const out = await Promise.all((data || []).map(async (r) => ({
      ...r, storage_path: undefined, downloadUrl: await signedDownload(admin, PURPOSE.exam_resource.bucket, r.storage_path),
    })));
    return res.status(200).json({ resources: out });
  }

  if (req.method === 'POST') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    const { path, label, name, mime, size } = req.body || {};
    const err = validateFile('exam_resource', name, mime, size);
    if (err) return res.status(400).json({ error: err });
    if (typeof path !== 'string' || !path.startsWith(prefix)) return res.status(400).json({ error: 'Invalid upload path.' });
    if (!(await objectExists(admin, PURPOSE.exam_resource.bucket, path))) {
      return res.status(400).json({ error: 'Upload not found. Please upload the file first.' });
    }
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 120) {
      return res.status(400).json({ error: 'Label is required (max 120 chars).' });
    }
    const { data, error } = await admin.from('exam_resources').insert({
      exam_id: id, label: label.trim(), name: String(name).trim(), mime, size_bytes: size, storage_path: path,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(201).json({ resource: data });
  }

  if (req.method === 'DELETE') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage exams.' });
    const { resource_id } = req.body || {};
    if (typeof resource_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const { data: r } = await admin.from('exam_resources').select('*').eq('id', resource_id).eq('exam_id', id).single();
    if (!r) return res.status(404).json({ error: 'Resource not found.' });
    await admin.storage.from(PURPOSE.exam_resource.bucket).remove([r.storage_path]);
    await admin.from('exam_resources').delete().eq('id', resource_id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
