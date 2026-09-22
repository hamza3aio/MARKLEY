// /api/plans/:id — GET, PATCH (fields), DELETE (only when unused; else deactivate).
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
  const manager = isAdmin(profile) || hasPerm(permissions, 'plans.manage');

  const { data: plan } = await admin.from('plans').select('*').eq('id', id).single();
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  if (req.method === 'GET') {
    const { data: feats } = await admin.from('plan_features').select('*').eq('plan_id', id);
    return res.status(200).json({ plan, features: Object.fromEntries((feats || []).map((f) => [f.feature_key, f.value])), canManage: manager });
  }

  if (req.method === 'PATCH') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage plans.' });
    const { name, description, price_monthly, is_active } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Invalid name.' });
      patch.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 1000) return res.status(400).json({ error: 'Description is too long.' });
      patch.description = description.trim();
    }
    if (price_monthly !== undefined) {
      const price = price_monthly === null || price_monthly === '' ? null : Number(price_monthly);
      if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Invalid price.' });
      patch.price_monthly = price;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'Invalid request.' });
      if (plan.is_default && !is_active) return res.status(400).json({ error: 'The default plan cannot be deactivated.' });
      patch.is_active = is_active;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('plans').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'plan.change', target_type: 'plan', target_id: id, metadata: { fields: Object.keys(patch) }, ip: clientIp(req) });
    return res.status(200).json({ plan: data });
  }

  if (req.method === 'DELETE') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage plans.' });
    if (plan.is_default) return res.status(400).json({ error: 'The default plan cannot be deleted.' });
    const { count } = await admin.from('user_plans').select('user_id', { count: 'exact', head: true }).eq('plan_id', id);
    if ((count ?? 0) > 0) {
      await admin.from('plans').update({ is_active: false }).eq('id', id);
      return res.status(200).json({ ok: true, deactivated: true });
    }
    await admin.from('plans').delete().eq('id', id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
