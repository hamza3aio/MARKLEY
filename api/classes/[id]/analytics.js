// /api/classes/:id/analytics — staff overview; students see own row; parents see linked rows.
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: last 90 days), ?student_id= (staff).
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

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));

  let scopeIds = null; // null = all students (staff)
  if (!staff) {
    if (member?.role_in_class === 'student') scopeIds = [user.id];
    else if (profile.role === 'parent') {
      const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
      scopeIds = (links || []).map((l) => l.student_id);
      if (!scopeIds.length) return res.status(200).json({ rows: [], summary: null });
    } else {
      return res.status(403).json({ error: 'You do not have access to analytics.' });
    }
  }

  const { data: students } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active').limit(500);
  let sids = (students || []).map((s) => s.user_id);
  if (scopeIds) sids = sids.filter((s) => scopeIds.includes(s));
  const qStudent = typeof req.query?.student_id === 'string' ? req.query.student_id : null;
  if (qStudent) {
    if (!staff) return res.status(403).json({ error: 'Only staff can query other students.' });
    sids = sids.filter((s) => s === qStudent);
  }
  if (!sids.length) return res.status(200).json({ rows: [], summary: null, assignments: [] });

  const { data: profs } = await admin.from('profiles').select('id,full_name,email').in('id', sids);
  const byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));

  const { data: assignments } = await admin.from('assignments').select('id,title,type,max_points,created_at').eq('class_id', id).is('deleted_at', null).eq('status', 'published').order('created_at', { ascending: true }).limit(200);
  const aids = (assignments || []).map((a) => a.id);

  let grades = [], subs = [];
  if (aids.length) {
    ({ data: grades } = await admin.from('grades').select('assignment_id,student_id,score,max_points').in('assignment_id', aids).in('student_id', sids));
    ({ data: subs } = await admin.from('assignment_submissions').select('assignment_id,student_id,status').in('assignment_id', aids).in('student_id', sids));
  }
  const from = typeof req.query?.from === 'string' ? req.query.from : null;
  const to = typeof req.query?.to === 'string' ? req.query.to : null;
  let attQ = admin.from('attendance').select('student_id,status').eq('class_id', id).in('student_id', sids).limit(5000);
  if (from) attQ = attQ.gte('date', from);
  if (to) attQ = attQ.lte('date', to);
  const { data: att } = await attQ;

  const rows = sids.map((sid) => {
    const g = (grades || []).filter((x) => x.student_id === sid);
    const s = (subs || []).filter((x) => x.student_id === sid);
    const a = (att || []).filter((x) => x.student_id === sid);
    const avg = g.length ? g.reduce((n, x) => n + (Number(x.score) / Number(x.max_points)) * 100, 0) / g.length : null;
    const present = a.filter((x) => x.status === 'present' || x.status === 'late').length;
    return {
      student_id: sid, name: byId[sid]?.full_name || '—', email: byId[sid]?.email || '',
      avg_pct: avg === null ? null : Math.round(avg * 10) / 10,
      graded_count: g.length,
      submitted_count: s.length,
      late_count: s.filter((x) => x.status === 'late').length,
      attendance_pct: a.length ? Math.round((present / a.length) * 1000) / 10 : null,
      sessions: a.length,
    };
  });

  const gradedAvgs = rows.filter((r) => r.avg_pct !== null).map((r) => r.avg_pct);
  const allSubs = (subs || []).length;
  const expectedSubs = aids.length * sids.length;
  const attRows = (att || []);
  const attPresent = attRows.filter((x) => x.status === 'present' || x.status === 'late').length;
  const perAsg = (assignments || []).map((x) => {
    const gg = (grades || []).filter((g) => g.assignment_id === x.id);
    return {
      id: x.id, title: x.title, type: x.type,
      avg_pct: gg.length ? Math.round((gg.reduce((n, g) => n + (Number(g.score) / Number(g.max_points)) * 100, 0) / gg.length) * 10) / 10 : null,
      graded_count: gg.length,
      submitted_count: (subs || []).filter((s) => s.assignment_id === x.id).length,
    };
  });

  return res.status(200).json({
    rows,
    assignments: perAsg,
    summary: {
      students: sids.length,
      assignments: aids.length,
      avg_score: gradedAvgs.length ? Math.round((gradedAvgs.reduce((a, b) => a + b, 0) / gradedAvgs.length) * 10) / 10 : null,
      submission_rate: expectedSubs ? Math.round((allSubs / expectedSubs) * 1000) / 10 : null,
      attendance_rate: attRows.length ? Math.round((attPresent / attRows.length) * 1000) / 10 : null,
    },
  });
}
