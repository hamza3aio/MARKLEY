// /api/classes/:id/assignments — GET list, POST create (assignment.create).
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';
import { notifyUsers, sendEmail, appLink } from '../../_lib/email.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!member && !isAdmin(profile)) {
    if (profile.role !== 'parent') return res.status(403).json({ error: 'You do not have access to this class.' });
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    const sids = (links || []).map((l) => l.student_id);
    let ok = false;
    if (sids.length) {
      const { data: m } = await admin.from('class_members').select('id').eq('class_id', id).in('user_id', sids).eq('status', 'active').limit(1);
      ok = !!(m && m.length);
    }
    if (!ok) return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  if (req.method === 'GET') {
    let q = admin.from('assignments').select('id,title,type,status,due_date,allow_late,max_points,created_at').eq('class_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    if (!staff) q = q.eq('status', 'published');
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    let submittedIds = [];
    if (member?.role_in_class === 'student') {
      const { data: subs } = await admin.from('assignment_submissions').select('assignment_id').eq('student_id', user.id);
      submittedIds = (subs || []).map((s) => s.assignment_id);
    }
    return res.status(200).json({ assignments: data || [], submittedIds });
  }

  if (req.method === 'POST') {
    if (!hasPerm(permissions, 'assignment.create') && !isAdmin(profile)) {
      return res.status(403).json({ error: 'You do not have permission to create assignments.' });
    }
    if (!staff) return res.status(403).json({ error: 'Only class staff can create assignments.' });
    const { title, description = '', instructions = '', type = 'normal', status = 'published', due_date = null, allow_late = false, max_points = 100 } = req.body || {};
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 3-200 characters.' });
    }
    if (typeof description !== 'string' || description.length > 5000) return res.status(400).json({ error: 'Description is too long.' });
    if (typeof instructions !== 'string' || instructions.length > 5000) return res.status(400).json({ error: 'Instructions are too long.' });
    if (!['guided', 'normal'].includes(type)) return res.status(400).json({ error: 'Type must be guided or normal.' });
    if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    let due = null;
    if (due_date) {
      due = new Date(due_date);
      if (Number.isNaN(due.getTime())) return res.status(400).json({ error: 'Invalid due date.' });
      due = due.toISOString();
    }
    const points = Number(max_points);
    if (!Number.isInteger(points) || points < 1 || points > 1000) return res.status(400).json({ error: 'Points must be 1-1000.' });
    const { data, error } = await admin.from('assignments').insert({
      class_id: id, title: title.trim(), description: description.trim(), instructions: instructions.trim(),
      type, status, due_date: due, allow_late: !!allow_late, max_points: points, created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'assignment.create', target_type: 'class', target_id: id, metadata: { assignment_id: data.id, title: data.title }, ip: clientIp(req) });
    if (data.status === 'published') {
      const { data: members } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active');
      const ids = (members || []).map((m) => m.user_id);
      const link = appLink(`/dashboard.html?tab=assignments&open=${data.id}`);
      await notifyUsers(admin, { user_ids: ids, type: 'assignment', title: `New assignment: ${data.title}`, body: data.due_date ? `Due ${new Date(data.due_date).toLocaleString()}` : '', link });
      sendEmail(admin, ids, `New assignment: ${data.title}`, `New assignment: ${data.title}`, `<p>${data.description || ''}</p>`, link).catch(() => {});
    }
    return res.status(201).json({ assignment: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
