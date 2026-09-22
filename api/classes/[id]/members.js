// /api/classes/:id/members — GET active members (same access as class detail).
import { authContext, isAdmin, activeMembership } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });

  const member = await activeMembership(admin, id, user.id);
  if (!member && !isAdmin(profile)) {
    if (profile.role === 'parent') {
      const { data: links } = await admin.from('parent_student_links')
        .select('student_id').eq('parent_id', user.id).eq('status', 'active');
      const sids = (links || []).map((l) => l.student_id);
      let ok = false;
      if (sids.length) {
        const { data: m } = await admin.from('class_members')
          .select('id').eq('class_id', id).in('user_id', sids).eq('status', 'active').limit(1);
        ok = !!(m && m.length);
      }
      if (!ok) return res.status(403).json({ error: 'You do not have access to this class.' });
    } else {
      return res.status(403).json({ error: 'You do not have access to this class.' });
    }
  }

  const { data: members, error } = await admin.from('class_members')
    .select('id,user_id,role_in_class,status,joined_at').eq('class_id', id).eq('status', 'active')
    .order('joined_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

  const uids = (members || []).map((m) => m.user_id);
  let profilesById = {};
  if (uids.length) {
    const { data: profs } = await admin.from('profiles').select('id,full_name,email,role').in('id', uids);
    profilesById = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  }
  return res.status(200).json({
    members: (members || []).map((m) => ({ ...m, profile: profilesById[m.user_id] || null })),
  });
}
