// /api/assignments/:id — GET detail, PATCH edit, DELETE soft-delete.
// Students/parents see published only. Edit/delete: owner teacher or admin.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';
import { PURPOSE, signedDownload } from '../_lib/files.js';

async function authorize(admin, asg, user, profile) {
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', asg.class_id).is('deleted_at', null).single();
  if (!cls) return null;
  const member = await activeMembership(admin, asg.class_id, user.id);
  let parentOk = false;
  if (!member && !isAdmin(profile) && profile.role === 'parent') {
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    const sids = (links || []).map((l) => l.student_id);
    if (sids.length) {
      const { data: m } = await admin.from('class_members').select('id').eq('class_id', asg.class_id).in('user_id', sids).eq('status', 'active').limit(1);
      parentOk = !!(m && m.length);
    }
  }
  if (!member && !isAdmin(profile) && !parentOk) return null;
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  return { cls, member, staff, parentOk };
}

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: asg } = await admin.from('assignments').select('*').eq('id', id).is('deleted_at', null).single();
  if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
  const az = await authorize(admin, asg, user, profile);
  if (!az) return res.status(403).json({ error: 'You do not have access to this assignment.' });
  if (!az.staff && asg.status !== 'published') return res.status(404).json({ error: 'Assignment not found.' });

  if (req.method === 'GET') {
    const { data: atts } = await admin.from('assignment_attachments').select('*').eq('assignment_id', id).order('created_at', { ascending: true });
    const attachments = await Promise.all((atts || []).map(async (a) => ({
      ...a, downloadUrl: await signedDownload(admin, PURPOSE.assignment.bucket, a.storage_path),
    })));
    let extra = {};
    if (az.staff) {
      const { data: subs, count } = await admin.from('assignment_submissions').select('id', { count: 'exact' }).eq('assignment_id', id);
      extra.submission_count = count ?? (subs || []).length;
    } else if (az.member?.role_in_class === 'student') {
      const { data: mine } = await admin.from('assignment_submissions').select('id,status,submitted_at').eq('assignment_id', id).eq('student_id', user.id).single();
      extra.my_submission = mine || null;
    }
    return res.status(200).json({ assignment: asg, attachments, ...extra });
  }

  const canManage = isAdmin(profile) || az.cls.teacher_id === user.id;
  if (req.method === 'PATCH') {
    if (!canManage) return res.status(403).json({ error: 'You do not have permission to edit this assignment.' });
    const { title, description, instructions, type, status, due_date, allow_late, max_points } = req.body || {};
    const patch = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) return res.status(400).json({ error: 'Title must be 3-200 characters.' });
      patch.title = title.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 5000) return res.status(400).json({ error: 'Description is too long.' });
      patch.description = description.trim();
    }
    if (instructions !== undefined) {
      if (typeof instructions !== 'string' || instructions.length > 5000) return res.status(400).json({ error: 'Instructions are too long.' });
      patch.instructions = instructions.trim();
    }
    if (type !== undefined) {
      if (!['guided', 'normal'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });
      patch.type = type;
    }
    if (status !== undefined) {
      if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
      patch.status = status;
    }
    if (due_date !== undefined) {
      if (due_date === null || due_date === '') patch.due_date = null;
      else {
        const d = new Date(due_date);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid due date.' });
        patch.due_date = d.toISOString();
      }
    }
    if (allow_late !== undefined) patch.allow_late = !!allow_late;
    if (max_points !== undefined) {
      const p = Number(max_points);
      if (!Number.isInteger(p) || p < 1 || p > 1000) return res.status(400).json({ error: 'Points must be 1-1000.' });
      patch.max_points = p;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('assignments').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'assignment.update', target_type: 'assignment', target_id: id, metadata: { fields: Object.keys(patch) }, ip: clientIp(req) });
    return res.status(200).json({ assignment: data });
  }

  if (req.method === 'DELETE') {
    if (!canManage) return res.status(403).json({ error: 'You do not have permission to delete this assignment.' });
    await admin.from('assignments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'assignment.delete', target_type: 'assignment', target_id: id, metadata: {}, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
