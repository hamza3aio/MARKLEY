// /api/classes/:id/leaderboard — GET ranked totals.
// Requires classes.leaderboard_enabled (staff bypass for management).
// Privacy: anonymize unless leaderboard_show_names or caller is staff;
// non-staff always see their own / linked students' real names.
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

  const { data: cls } = await admin.from('classes').select('id,name,teacher_id,leaderboard_enabled,leaderboard_show_names').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  let linked = [];
  if (!member && !isAdmin(profile)) {
    if (profile.role !== 'parent') return res.status(403).json({ error: 'You do not have access to this class.' });
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
    linked = (links || []).map((l) => l.student_id);
    if (!linked.length) return res.status(200).json({ enabled: !!cls.leaderboard_enabled, entries: [] });
  }
  if (!cls.leaderboard_enabled && !staff) {
    return res.status(200).json({ enabled: false, entries: [] });
  }

  const { data: students } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active').limit(500);
  const sids = (students || []).map((s) => s.user_id);
  const totals = {};
  if (sids.length) {
    const { data: rows } = await admin.from('points').select('user_id,points').eq('class_id', id).in('user_id', sids).limit(5000);
    (rows || []).forEach((r) => { totals[r.user_id] = (totals[r.user_id] || 0) + Number(r.points); });
  }
  const { data: profs } = sids.length ? await admin.from('profiles').select('id,full_name').in('id', sids) : { data: [] };
  const names = Object.fromEntries(((profs) || []).map((p) => [p.id, p.full_name || 'Student']));

  const ranked = sids.map((sid) => ({ user_id: sid, total: totals[sid] || 0 })).sort((a, b) => b.total - a.total);
  const entries = ranked.map((r, i) => {
    const mine = r.user_id === user.id || linked.includes(r.user_id);
    const show = staff || cls.leaderboard_show_names || mine;
    return { rank: i + 1, total: r.total, mine, name: show ? (names[r.user_id] || 'Student') : `Student ${i + 1}` };
  });
  return res.status(200).json({ enabled: !!cls.leaderboard_enabled, show_names: !!cls.leaderboard_show_names, entries });
}
