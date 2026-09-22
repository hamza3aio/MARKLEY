// /api/parent-links — GET my links, POST create link (admin or teacher).
import { authContext, hasPerm, isAdmin, logActivity, clientIp, validEmail } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const studentEmail = typeof req.query?.student_email === 'string' ? req.query.student_email.toLowerCase() : null;
    if (profile.role === 'parent') {
      const { data: links } = await admin.from('parent_student_links')
        .select('id,student_id,created_at').eq('parent_id', user.id).eq('status', 'active');
      const sids = (links || []).map((l) => l.student_id);
      let students = [];
      if (sids.length) {
        const { data } = await admin.from('profiles').select('id,full_name,email').in('id', sids);
        students = data || [];
      }
      return res.status(200).json({ links: links || [], students });
    }
    if (profile.role === 'teacher' || isAdmin(profile)) {
      if (studentEmail) {
        const { data: s } = await admin.from('profiles').select('id,full_name,email').eq('email', studentEmail).single();
        if (!s) return res.status(200).json({ links: [], students: [] });
        const { data: links } = await admin.from('parent_student_links')
          .select('id,parent_id,student_id,status,created_at').eq('student_id', s.id).eq('status', 'active');
        const pids = (links || []).map((l) => l.parent_id);
        let parents = [];
        if (pids.length) {
          const { data } = await admin.from('profiles').select('id,full_name,email').in('id', pids);
          parents = data || [];
        }
        return res.status(200).json({ links: links || [], parents, student: s });
      }
      return res.status(200).json({ links: [], note: 'Pass ?student_email= to look up links.' });
    }
    return res.status(403).json({ error: 'You do not have access to parent links.' });
  }

  if (req.method === 'POST') {
    const can = isAdmin(profile) || (profile.role === 'teacher' && hasPerm(permissions, 'class.invite'));
    if (!can) return res.status(403).json({ error: 'You do not have permission to link parents.' });
    const { parent_email, student_email } = req.body || {};
    if (!validEmail(parent_email) || !validEmail(student_email)) {
      return res.status(400).json({ error: 'Valid parent and student emails are required.' });
    }
    const { data: parent } = await admin.from('profiles')
      .select('id,role,status,email').eq('email', parent_email.trim().toLowerCase()).single();
    const { data: student } = await admin.from('profiles')
      .select('id,role,status,email').eq('email', student_email.trim().toLowerCase()).single();
    if (!parent || parent.role !== 'parent' || parent.status !== 'active') {
      return res.status(400).json({ error: 'Parent account not found or not active.' });
    }
    if (!student || student.role !== 'student' || student.status !== 'active') {
      return res.status(400).json({ error: 'Student account not found or not active.' });
    }
    const { data, error } = await admin.from('parent_student_links').upsert(
      { parent_id: parent.id, student_id: student.id, created_by: user.id, status: 'active' },
      { onConflict: 'parent_id,student_id' }
    ).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, {
      actor_id: user.id, actor_role: profile.role, action: 'parent.link',
      target_type: 'student', target_id: student.id,
      metadata: { parent_id: parent.id }, ip: clientIp(req),
    });
    return res.status(201).json({ link: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
