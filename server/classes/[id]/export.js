// /api/classes/:id/export — GET ?type=grades|attendance|report → .xlsx download.
// Staff with reports.export only. Generated server-side with exceljs.
import ExcelJS from 'exceljs';
import { authContext, hasPerm, isAdmin, activeMembership } from '../../_lib/auth.js';
import { requireFlag, sendPlanError } from '../../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id, type = 'report' } = req.query || {};
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string' || !['grades', 'attendance', 'report'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  if (!hasPerm(permissions, 'reports.export') && !isAdmin(profile)) {
    return res.status(403).json({ error: 'You do not have permission to export reports.' });
  }
  try {
    await requireFlag(admin, profile, 'exports');
  } catch (e) {
    if (sendPlanError(res, e)) return;
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  const { data: cls } = await admin.from('classes').select('id,name,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
  if (!staff) return res.status(403).json({ error: 'Only class staff can export.' });

  const { data: students } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active').limit(500);
  const sids = (students || []).map((s) => s.user_id);
  const { data: profs } = sids.length
    ? await admin.from('profiles').select('id,full_name,email').in('id', sids)
    : { data: [] };
  const byId = Object.fromEntries(((profs) || []).map((p) => [p.id, p]));

  const { data: assignments } = await admin.from('assignments').select('id,title,max_points').eq('class_id', id).is('deleted_at', null).eq('status', 'published').order('created_at', { ascending: true }).limit(200);
  const aids = (assignments || []).map((a) => a.id);
  let grades = [], subs = [], att = [];
  if (sids.length && aids.length) {
    ({ data: grades } = await admin.from('grades').select('assignment_id,student_id,score,max_points').in('assignment_id', aids).in('student_id', sids));
  }
  if (sids.length && aids.length) {
    ({ data: subs } = await admin.from('assignment_submissions').select('assignment_id,student_id,status').in('assignment_id', aids).in('student_id', sids));
  }
  if (sids.length) {
    ({ data: att } = await admin.from('attendance').select('student_id,status').eq('class_id', id).in('student_id', sids).limit(5000));
  }
  const gMap = {}, sMap = {}, aMap = {};
  (grades || []).forEach((g) => { gMap[`${g.student_id}:${g.assignment_id}`] = g; });
  (subs || []).forEach((s) => { sMap[`${s.student_id}:${s.assignment_id}`] = s; });
  (att || []).forEach((a) => { (aMap[a.student_id] = aMap[a.student_id] || []).push(a.status); });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Markley';
  wb.created = new Date();

  function studentRow(sid) {
    const g = (grades || []).filter((x) => x.student_id === sid);
    const avg = g.length ? g.reduce((n, x) => n + (Number(x.score) / Number(x.max_points)) * 100, 0) / g.length : null;
    const recs = aMap[sid] || [];
    const pres = recs.filter((x) => x === 'present' || x === 'late').length;
    return { avg, attPct: recs.length ? (pres / recs.length) * 100 : null, late: (subs || []).filter((x) => x.student_id === sid && x.status === 'late').length };
  }

  if (type === 'grades' || type === 'report') {
    const ws = wb.addWorksheet(type === 'grades' ? 'Grades' : 'Report');
    ws.addRow(['Student', 'Email', ...(assignments || []).map((a) => a.title), 'Average %', ...(type === 'report' ? ['Late', 'Attendance %'] : [])]);
    sids.forEach((sid) => {
      const r = studentRow(sid);
      ws.addRow([
        byId[sid]?.full_name || '—', byId[sid]?.email || '',
        ...(assignments || []).map((a) => gMap[`${sid}:${a.id}`]?.score ?? ''),
        r.avg === null ? '' : Math.round(r.avg * 10) / 10,
        ...(type === 'report' ? [r.late, r.attPct === null ? '' : Math.round(r.attPct * 10) / 10] : []),
      ]);
    });
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
  }

  if (type === 'attendance') {
    const ws = wb.addWorksheet('Attendance');
    ws.addRow(['Student', 'Email', 'Present/Late', 'Sessions', 'Attendance %']);
    sids.forEach((sid) => {
      const recs = aMap[sid] || [];
      const pres = recs.filter((x) => x === 'present' || x === 'late').length;
      ws.addRow([byId[sid]?.full_name || '—', byId[sid]?.email || '', pres, recs.length, recs.length ? Math.round((pres / recs.length) * 1000) / 10 : '']);
    });
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
  }

  const buf = await wb.xlsx.writeBuffer();
  const safe = cls.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'class';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="markley-${type}-${safe}.xlsx"`);
  return res.send(Buffer.from(buf));
}
