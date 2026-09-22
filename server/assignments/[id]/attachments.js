// /api/assignments/:id/attachments — GET list, POST confirm, DELETE remove.
// Confirm: teacher/admin of the class only. Paths must match the assignment prefix.
import { authContext, isAdmin, activeMembership } from '../../_lib/auth.js';
import { PURPOSE, validateFile, signedDownload, objectExists } from '../../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('id,class_id,status').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', asg.class_id).single();
  const member = await activeMembership(admin, asg.class_id, user.id);
  const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile)) return res.status(403).json({ error: 'You do not have access to this assignment.' });
  if (!staff && asg.status !== 'published') return res.status(404).json({ error: 'Assignment not found.' });

  const prefix = `class/${asg.class_id}/assignments/${id}/`;

  if (req.method === 'GET') {
    const { data, error } = await admin.from('assignment_attachments').select('*').eq('assignment_id', id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const out = await Promise.all((data || []).map(async (a) => ({
      ...a, downloadUrl: await signedDownload(admin, PURPOSE.assignment.bucket, a.storage_path),
    })));
    return res.status(200).json({ attachments: out });
  }

  if (req.method === 'POST') {
    if (!isAdmin(profile) && cls?.teacher_id !== user.id) {
      return res.status(403).json({ error: 'Only the class teacher can attach files.' });
    }
    const { path, name, mime, size } = req.body || {};
    const err = validateFile('assignment', name, mime, size);
    if (err) return res.status(400).json({ error: err });
    if (typeof path !== 'string' || !path.startsWith(prefix)) return res.status(400).json({ error: 'Invalid upload path.' });
    if (!(await objectExists(admin, PURPOSE.assignment.bucket, path))) {
      return res.status(400).json({ error: 'Upload not found. Please upload the file first.' });
    }
    const { data, error } = await admin.from('assignment_attachments').insert({
      assignment_id: id, name: String(name).trim(), mime, size_bytes: size, storage_path: path,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(201).json({ attachment: data });
  }

  if (req.method === 'DELETE') {
    if (!isAdmin(profile) && cls?.teacher_id !== user.id) {
      return res.status(403).json({ error: 'Only the class teacher can remove attachments.' });
    }
    const { attachment_id } = req.body || {};
    if (typeof attachment_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const { data: att } = await admin.from('assignment_attachments').select('*').eq('id', attachment_id).eq('assignment_id', id).single();
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
    await admin.storage.from(PURPOSE.assignment.bucket).remove([att.storage_path]);
    await admin.from('assignment_attachments').delete().eq('id', attachment_id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
