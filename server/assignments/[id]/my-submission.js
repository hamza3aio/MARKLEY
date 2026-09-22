// /api/assignments/:id/my-submission — GET the caller's own submission + file URLs.
import { authContext, activeMembership } from '../../_lib/auth.js';
import { PURPOSE, signedDownload } from '../../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('id,class_id,status').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const member = await activeMembership(admin, asg.class_id, user.id);
  if (!member || member.role_in_class !== 'student') {
    return res.status(403).json({ error: 'Only enrolled students can view submissions.' });
  }
  const { data: sub } = await admin.from('assignment_submissions').select('*').eq('assignment_id', id).eq('student_id', user.id).single();
  if (!sub) return res.status(200).json({ submission: null, files: [] });
  const { data: files } = await admin.from('submission_files').select('*').eq('submission_id', sub.id);
  const out = await Promise.all((files || []).map(async (f) => ({
    ...f, downloadUrl: await signedDownload(admin, PURPOSE.submission.bucket, f.storage_path),
  })));
  return res.status(200).json({ submission: sub, files: out });
}
