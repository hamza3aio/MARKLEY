// /api/classes — GET: classes I can access. POST: create (class.create required).
import { authContext, hasPerm, isAdmin, logActivity, clientIp, validEmail } from '../_lib/auth.js';
import { seedDefaultRules } from '../_lib/points.js';
import { getPlan, planLimitError, sendPlanError } from '../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    let classes = [];
    if (isAdmin(profile)) {
      const { data, error } = await admin.from('classes')
        .select('id,name,subject,description,teacher_id,leaderboard_enabled,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      classes = data || [];
    } else if (profile.role === 'parent') {
      // Parents see classes of linked students.
      const { data: links } = await admin.from('parent_student_links')
        .select('student_id').eq('parent_id', user.id).eq('status', 'active');
      const sids = (links || []).map((l) => l.student_id);
      if (!sids.length) return res.status(200).json({ classes: [] });
      const { data: memberships } = await admin.from('class_members')
        .select('class_id').in('user_id', sids).eq('status', 'active');
      const cids = [...new Set((memberships || []).map((m) => m.class_id))];
      if (!cids.length) return res.status(200).json({ classes: [] });
      const { data, error } = await admin.from('classes').select('id,name,subject,description,teacher_id,leaderboard_enabled,created_at')
        .in('id', cids).is('deleted_at', null);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      classes = data || [];
    } else {
      const { data: memberships } = await admin.from('class_members')
        .select('class_id').eq('user_id', user.id).eq('status', 'active');
      const cids = [...new Set((memberships || []).map((m) => m.class_id))];
      if (!cids.length) return res.status(200).json({ classes: [] });
      const { data, error } = await admin.from('classes').select('id,name,subject,description,teacher_id,leaderboard_enabled,created_at')
        .in('id', cids).is('deleted_at', null);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      classes = data || [];
    }
    return res.status(200).json({ classes });
  }

  if (req.method === 'POST') {
    if (!hasPerm(permissions, 'class.create')) {
      return res.status(403).json({ error: 'You do not have permission to create classes.' });
    }
    const { name, subject, description = '', teacher_email } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 120) {
      return res.status(400).json({ error: 'Class name must be 3-120 characters.' });
    }
    if (typeof subject !== 'string' || subject.trim().length < 2 || subject.trim().length > 80) {
      return res.status(400).json({ error: 'Subject must be 2-80 characters.' });
    }
    if (typeof description !== 'string' || description.length > 2000) {
      return res.status(400).json({ error: 'Description is too long.' });
    }

    // Resolve owner: teachers own their classes; admin may assign another teacher.
    let teacherId = user.id;
    if (teacher_email) {
      if (!isAdmin(profile)) return res.status(403).json({ error: 'Only admin can assign another teacher.' });
      if (!validEmail(teacher_email)) return res.status(400).json({ error: 'Invalid teacher email.' });
      const { data: t } = await admin.from('profiles')
        .select('id,role,status').eq('email', teacher_email.trim().toLowerCase()).single();
      if (!t || t.role !== 'teacher' || t.status !== 'active') {
        return res.status(400).json({ error: 'Teacher not found or not active.' });
      }
      teacherId = t.id;
    } else if (profile.role !== 'teacher' && !isAdmin(profile)) {
      return res.status(403).json({ error: 'Only teachers can own classes.' });
    }

    // Plan gate: class count of the owner vs classes.max (admins bypass).
    try {
      const { data: owner } = await admin.from('profiles').select('role').eq('id', teacherId).single();
      if (owner?.role !== 'admin') {
        const { features } = await getPlan(admin, teacherId);
        const { count } = await admin.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).is('deleted_at', null);
        if ((count ?? 0) >= (features['classes.max'] ?? 5)) throw planLimitError('classes.max', features['classes.max'] ?? 5, count ?? 0);
      }
    } catch (e) {
      if (sendPlanError(res, e)) return;
    }

    const { data: cls, error } = await admin.from('classes').insert({
      name: name.trim(), subject: subject.trim(), description: description.trim(),
      teacher_id: teacherId, created_by: user.id,
    }).select('id,name,subject,description,teacher_id,leaderboard_enabled,created_at').single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

    await admin.from('class_members').insert({
      class_id: cls.id, user_id: teacherId, role_in_class: 'teacher', invited_by: user.id,
    });
    await seedDefaultRules(admin, cls.id, user.id);
    await logActivity(admin, {
      actor_id: user.id, actor_role: profile.role, action: 'class.create',
      target_type: 'class', target_id: cls.id, metadata: { name: cls.name }, ip: clientIp(req),
    });
    return res.status(201).json({ class: cls });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
