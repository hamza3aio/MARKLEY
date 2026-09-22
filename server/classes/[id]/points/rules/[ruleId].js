// /api/classes/:id/points/rules/:ruleId — PATCH edit, DELETE remove (owner teacher/admin).
// Delete is blocked when ledger entries exist (deactivate instead).
import { authContext, isAdmin } from '../../../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id, ruleId } = req.query || {};
  if (typeof id !== 'string' || typeof ruleId !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', id).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });
  if (!isAdmin(profile) && cls.teacher_id !== user.id) {
    return res.status(403).json({ error: 'Only the class teacher can manage point rules.' });
  }
  const { data: rule } = await admin.from('point_rules').select('*').eq('id', ruleId).eq('class_id', id).single();
  if (!rule) return res.status(404).json({ error: 'Rule not found.' });

  if (req.method === 'PATCH') {
    const { name, points, active } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Name must be 2-80 characters.' });
      patch.name = name.trim();
    }
    if (points !== undefined) {
      const pts = Number(points);
      if (!Number.isInteger(pts) || pts < -1000 || pts > 1000 || pts === 0) return res.status(400).json({ error: 'Points must be a non-zero integer.' });
      patch.points = pts;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return res.status(400).json({ error: 'Invalid request.' });
      patch.active = active;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('point_rules').update(patch).eq('id', ruleId).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ rule: data });
  }

  if (req.method === 'DELETE') {
    const { count } = await admin.from('points').select('id', { count: 'exact', head: true }).eq('rule_id', ruleId);
    if ((count ?? 0) > 0) {
      await admin.from('point_rules').update({ active: false }).eq('id', ruleId);
      return res.status(200).json({ ok: true, deactivated: true });
    }
    await admin.from('point_rules').delete().eq('id', ruleId);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
