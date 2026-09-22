// /api/classes/:id — GET detail, PATCH edit, DELETE soft-delete.
// Access: admin, active member, or linked parent. Edit/delete: admin or owner teacher.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('*').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });

  const member = await activeMembership(admin, id, user.id);
  let parentAccess = false;
  if (!member && !isAdmin(profile) && profile.role === 'parent') {
    const { data: links } = await admin.from('parent_student_links')
      .select('student_id').eq('parent_id', user.id).eq('status', 'active');
    const sids = (links || []).map((l) => l.student_id);
    if (sids.length) {
      const { data: m } = await admin.from('class_members')
        .select('id').eq('class_id', id).in('user_id', sids).eq('status', 'active').limit(1);
      parentAccess = !!(m && m.length);
    }
  }
  if (!member && !isAdmin(profile) && !parentAccess) {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  if (req.method === 'GET') {
    const { data: members } = await admin.from('class_members')
      .select('id').eq('class_id', id).eq('status', 'active');
    const { data: pending } = await admin.from('class_invitations')
      .select('id').eq('class_id', id).eq('status', 'pending');
    const { data: teacher } = await admin.from('profiles')
      .select('id,full_name,email').eq('id', cls.teacher_id).single();
    return res.status(200).json({
      class: { ...cls, member_count: (members || []).length, pending_invites: (pending || []).length },
      teacher,
      my_role: member?.role_in_class || (isAdmin(profile) ? 'admin' : parentAccess ? 'parent' : null),
    });
  }

  const owner = cls.teacher_id === user.id;
  const canEdit = isAdmin(profile) || (owner && hasPerm(permissions, 'class.edit'));
  const canDelete = isAdmin(profile) || (owner && hasPerm(permissions, 'class.delete'));

  if (req.method === 'PATCH') {
    if (!canEdit) return res.status(403).json({ error: 'You do not have permission to edit this class.' });
    const { name, subject, description, leaderboard_enabled } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 120) {
        return res.status(400).json({ error: 'Class name must be 3-120 characters.' });
      }
      patch.name = name.trim();
    }
    if (subject !== undefined) {
      if (typeof subject !== 'string' || subject.trim().length < 2 || subject.trim().length > 80) {
        return res.status(400).json({ error: 'Subject must be 2-80 characters.' });
      }
      patch.subject = subject.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 2000) {
        return res.status(400).json({ error: 'Description is too long.' });
      }
      patch.description = description.trim();
    }
    if (leaderboard_enabled !== undefined) {
      if (typeof leaderboard_enabled !== 'boolean') return res.status(400).json({ error: 'Invalid request.' });
      if (!hasPerm(permissions, 'leaderboard.manage') && !isAdmin(profile)) {
        return res.status(403).json({ error: 'You do not have permission to manage the leaderboard.' });
      }
      patch.leaderboard_enabled = leaderboard_enabled;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('classes').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, {
      actor_id: user.id, actor_role: profile.role, action: 'class.update',
      target_type: 'class', target_id: id, metadata: { fields: Object.keys(patch) }, ip: clientIp(req),
    });
    return res.status(200).json({ class: data });
  }

  if (req.method === 'DELETE') {
    if (!canDelete) return res.status(403).json({ error: 'You do not have permission to delete this class.' });
    const { error } = await admin.from('classes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, {
      actor_id: user.id, actor_role: profile.role, action: 'class.delete',
      target_type: 'class', target_id: id, metadata: {}, ip: clientIp(req),
    });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
