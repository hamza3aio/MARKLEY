// /api/classes/:id/attendance — GET records, POST mark a day.
// POST staff only. GET: staff all, students own, parents linked students.
import { authContext, isAdmin, logActivity, clientIp, activeMembership } from '../../_lib/auth.js';

const STATUSES = ['present', 'absent', 'late', 'excused'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  if (s > new Date().toISOString().slice(0, 10)) return null; // no future marking
  return s;
}

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  const member = await activeMembership(admin, id, user.id);
  const staff = isAdmin(profile) || cls.teacher_id === user.id ||
    (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));

  if (req.method === 'GET') {
    const { from, to, student_id } = req.query || {};
    let q = admin.from('attendance').select('*').eq('class_id', id).order('date', { ascending: false }).limit(1000);
    if (typeof from === 'string' && validDate(from)) q = q.gte('date', from);
    if (typeof to === 'string' && validDate(to)) q = q.lte('date', to);

    if (staff) {
      if (typeof student_id === 'string') q = q.eq('student_id', student_id);
    } else if (member?.role_in_class === 'student') {
      q = q.eq('student_id', user.id);
    } else if (profile.role === 'parent') {
      const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
      const sids = (links || []).map((l) => l.student_id);
      if (!sids.length) return res.status(200).json({ records: [] });
      q = q.in('student_id', sids);
    } else {
      return res.status(403).json({ error: 'You do not have access to attendance.' });
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ records: data || [] });
  }

  if (req.method === 'POST') {
    if (!staff) return res.status(403).json({ error: 'Only class staff can mark attendance.' });
    const { date, records } = req.body || {};
    const day = validDate(date);
    if (!day) return res.status(400).json({ error: 'Date must be today or earlier (YYYY-MM-DD).' });
    if (!Array.isArray(records) || !records.length || records.length > 500) {
      return res.status(400).json({ error: 'Provide 1–500 attendance records.' });
    }
    const { data: students } = await admin.from('class_members').select('user_id').eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active');
    const enrolled = new Set((students || []).map((s) => s.user_id));
    const rows = [];
    for (const r of records) {
      if (typeof r?.student_id !== 'string' || !enrolled.has(r.student_id) || !STATUSES.includes(r?.status)) {
        return res.status(400).json({ error: 'Invalid attendance record.' });
      }
      if (typeof r?.note === 'string' && r.note.length > 500) return res.status(400).json({ error: 'Note is too long.' });
      rows.push({ class_id: id, student_id: r.student_id, date: day, status: r.status, marked_by: user.id, note: (r.note || '').trim() });
    }
    const { error } = await admin.from('attendance').upsert(rows, { onConflict: 'class_id,date,student_id' });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'attendance.mark', target_type: 'class', target_id: id, metadata: { date: day, count: rows.length }, ip: clientIp(req) });
    return res.status(200).json({ ok: true, count: rows.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
