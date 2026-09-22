// POST /api/files/upload-url — validate then mint a signed upload URL.
// Body: { purpose: content|assignment|submission, class_id, assignment_id?, name, mime, size }
import { authContext, hasPerm, isAdmin, activeMembership } from '../_lib/auth.js';
import { PURPOSE, validateFile, buildPath, signedUpload } from '../_lib/files.js';
import { getPlan, planLimitError, sendPlanError, usage } from '../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const { purpose, class_id, assignment_id, name, mime, size } = req.body || {};
  if (!PURPOSE[purpose]) return res.status(400).json({ error: 'Invalid upload purpose.' });
  if (typeof class_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', class_id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, class_id, user.id);
  if (!member && !isAdmin(profile)) return res.status(403).json({ error: 'You do not have access to this class.' });

  const err = validateFile(purpose, name, mime, size);
  if (err) return res.status(400).json({ error: err });

  // Plan gate: storage quota (admins bypass).
  if (!isAdmin(profile)) {
    try {
      const u = await usage(admin, user.id);
      const limitMb = u.features['storage_mb.max'] ?? 1024;
      if ((u.used.storage_mb * 1048576 + size) / 1048576 > limitMb) {
        throw planLimitError('storage_mb.max', limitMb, u.used.storage_mb);
      }
    } catch (e) {
      if (sendPlanError(res, e)) return;
    }
  }

  if (purpose === 'content') {
    const ok = isAdmin(profile) || cls.teacher_id === user.id ||
      (!!member && member.role_in_class === 'assistant' && hasPerm(permissions, 'content.upload')) ||
      (!!member && member.role_in_class === 'teacher' && hasPerm(permissions, 'content.upload'));
    if (!ok) return res.status(403).json({ error: 'You do not have permission to upload content.' });
    const path = buildPath(`class/${class_id}/content`, name);
    const up = await signedUpload(admin, PURPOSE.content.bucket, path).catch(() => null);
    if (!up) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ bucket: PURPOSE.content.bucket, path, signedUrl: up.signedUrl, token: up.token });
  }

  // assignment + submission purposes require an assignment
  if (typeof assignment_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
  const { data: asg } = await admin.from('assignments').select('id,class_id,status,due_date,allow_late').eq('id', assignment_id).is('deleted_at', null).single();
  if (!asg || asg.class_id !== class_id) return res.status(404).json({ error: 'Assignment not found.' });

  if (purpose === 'assignment') {
    const ok = isAdmin(profile) || cls.teacher_id === user.id;
    if (!ok) return res.status(403).json({ error: 'You do not have permission to attach files.' });
    const path = buildPath(`class/${class_id}/assignments/${assignment_id}`, name);
    const up = await signedUpload(admin, PURPOSE.assignment.bucket, path).catch(() => null);
    if (!up) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ bucket: PURPOSE.assignment.bucket, path, signedUrl: up.signedUrl, token: up.token });
  }

  // submission
  if (!member || member.role_in_class !== 'student') {
    return res.status(403).json({ error: 'Only enrolled students can submit.' });
  }
  if (asg.status !== 'published') return res.status(409).json({ error: 'Assignment is not open for submissions.' });
  if (asg.due_date && new Date(asg.due_date).getTime() < Date.now() && !asg.allow_late) {
    return res.status(409).json({ error: 'The due date has passed.' });
  }
  const path = buildPath(`class/${class_id}/submissions/${assignment_id}`, name);
  const up = await signedUpload(admin, PURPOSE.submission.bucket, path).catch(() => null);
  if (!up) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  return res.status(200).json({ bucket: PURPOSE.submission.bucket, path, signedUrl: up.signedUrl, token: up.token });
}
