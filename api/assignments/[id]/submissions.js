// /api/assignments/:id/submissions — GET (staff: all with students + file URLs),
// POST (student: submit text + pre-uploaded files; guided requires text, normal requires file).
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';
import { PURPOSE, validateFile, signedDownload } from '../../_lib/files.js';
import { awardRule, grantAchievement } from '../../_lib/points.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('*').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', asg.class_id).single();
  const member = await activeMembership(admin, asg.class_id, user.id);
  const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile)) return res.status(403).json({ error: 'You do not have access to this assignment.' });

  if (req.method === 'GET') {
    if (!staff) return res.status(403).json({ error: 'Only class staff can view submissions.' });
    const { data: subs, error } = await admin.from('assignment_submissions').select('*').eq('assignment_id', id).order('submitted_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const sids = [...new Set((subs || []).map((s) => s.student_id))];
    let profs = {};
    if (sids.length) {
      const { data } = await admin.from('profiles').select('id,full_name,email').in('id', sids);
      profs = Object.fromEntries((data || []).map((p) => [p.id, p]));
    }
    const out = await Promise.all((subs || []).map(async (s) => {
      const { data: files } = await admin.from('submission_files').select('*').eq('submission_id', s.id);
      const withUrls = await Promise.all((files || []).map(async (f) => ({
        ...f, downloadUrl: await signedDownload(admin, PURPOSE.submission.bucket, f.storage_path),
      })));
      return { ...s, student: profs[s.student_id] || null, files: withUrls };
    }));
    return res.status(200).json({ submissions: out });
  }

  if (req.method === 'POST') {
    if (!member || member.role_in_class !== 'student') {
      return res.status(403).json({ error: 'Only enrolled students can submit.' });
    }
    if (asg.status !== 'published') return res.status(409).json({ error: 'Assignment is not open for submissions.' });
    const late = !!(asg.due_date && new Date(asg.due_date).getTime() < Date.now());
    if (late && !asg.allow_late) return res.status(409).json({ error: 'The due date has passed.' });

    const { text_content = '', files = [] } = req.body || {};
    if (typeof text_content !== 'string' || text_content.length > 20000) {
      return res.status(400).json({ error: 'Answer text is too long.' });
    }
    if (!Array.isArray(files) || files.length > 10) return res.status(400).json({ error: 'Up to 10 files per submission.' });
    if (asg.type === 'guided' && !text_content.trim()) {
      return res.status(400).json({ error: 'Guided assignments require a written answer.' });
    }
    if (asg.type === 'normal' && !files.length) {
      return res.status(400).json({ error: 'Please attach at least one file.' });
    }
    const prefix = `class/${asg.class_id}/submissions/${id}/`;
    for (const f of files) {
      const err = validateFile('submission', f?.name, f?.mime, f?.size);
      if (err) return res.status(400).json({ error: err });
      if (typeof f?.path !== 'string' || !f.path.startsWith(prefix)) {
        return res.status(400).json({ error: 'Invalid file reference.' });
      }
    }

    const status = late ? 'late' : 'submitted';
    const { data: existing } = await admin.from('assignment_submissions').select('id').eq('assignment_id', id).eq('student_id', user.id).single();
    let subId;
    if (existing) {
      const { error } = await admin.from('assignment_submissions')
        .update({ text_content: text_content.trim(), status, submitted_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      subId = existing.id;
      await admin.from('submission_files').delete().eq('submission_id', subId);
    } else {
      const { data, error } = await admin.from('assignment_submissions').insert({
        assignment_id: id, student_id: user.id, text_content: text_content.trim(), status,
      }).select('id').single();
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      subId = data.id;
    }
    if (files.length) {
      const rows = files.map((f) => ({
        submission_id: subId, name: String(f.name).trim(), mime: f.mime, size_bytes: f.size, storage_path: f.path,
      }));
      const { error } = await admin.from('submission_files').insert(rows);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'assignment.submit', target_type: 'assignment', target_id: id, metadata: { files: files.length, late }, ip: clientIp(req) });
    awardRule(admin, { class_id: asg.class_id, user_id: user.id, code: 'assignment_submit', dedupe_key: `submit:${id}`, awarded_by: null }).catch(() => {});
    return res.status(201).json({ ok: true, submission_id: subId, status });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
