// /api/notifications — GET own (latest 50, ?unread=1), PATCH mark read {ids?|all?}.
import { authContext } from './_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, admin } = ctx;

  if (req.method === 'GET') {
    let q = admin.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (req.query?.unread === '1') q = q.is('read_at', null);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null);
    return res.status(200).json({ notifications: data || [], unread: count ?? 0 });
  }

  if (req.method === 'PATCH') {
    const { ids, all } = req.body || {};
    if (all) {
      await admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
      return res.status(200).json({ ok: true });
    }
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every((x) => typeof x === 'string')) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    await admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).in('id', ids);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed.' });
}
