// PATCH /api/plan-requests/:id — update status (plans.manage).
import { authContext, hasPerm, isAdmin } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
  if (!isAdmin(profile) && !hasPerm(permissions, 'plans.manage')) {
    return res.status(403).json({ error: 'You do not have permission to manage plans.' });
  }
  const { status } = req.body || {};
  if (!['pending', 'contacted', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const { data, error } = await admin.from('plan_requests').update({ status }).eq('id', id).select().single();
  if (error || !data) return res.status(404).json({ error: 'Request not found.' });
  return res.status(200).json({ request: data });
}
