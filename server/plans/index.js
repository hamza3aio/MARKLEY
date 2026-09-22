// /api/plans — GET list with features (any active user), POST create (plans.manage).
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const manager = isAdmin(profile) || hasPerm(permissions, 'plans.manage');

  if (req.method === 'GET') {
    const { data: plans } = await admin.from('plans').select('*').order('price_monthly', { ascending: true, nullsFirst: false });
    const { data: feats } = await admin.from('plan_features').select('*');
    const byPlan = {};
    (feats || []).forEach((f) => { (byPlan[f.plan_id] = byPlan[f.plan_id] || []).push(f); });
    return res.status(200).json({
      plans: (plans || []).map((p) => ({ ...p, features: Object.fromEntries((byPlan[p.id] || []).map((f) => [f.feature_key, f.value])) })),
      canManage: manager,
    });
  }

  if (req.method === 'POST') {
    if (!manager) return res.status(403).json({ error: 'You do not have permission to manage plans.' });
    const { name, slug, description = '', price_monthly = null, is_active = true } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be 2-80 characters.' });
    }
    if (typeof slug !== 'string' || !/^[a-z0-9_]{2,40}$/.test(slug.trim())) {
      return res.status(400).json({ error: 'Slug must be 2-40 lowercase letters, numbers or _.' });
    }
    if (typeof description !== 'string' || description.length > 1000) return res.status(400).json({ error: 'Description is too long.' });
    const price = price_monthly === null || price_monthly === '' ? null : Number(price_monthly);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Invalid price.' });
    const { data, error } = await admin.from('plans').insert({
      name: name.trim(), slug: slug.trim(), description: description.trim(), price_monthly: price, is_active: !!is_active,
    }).select().single();
    if (error) return res.status(409).json({ error: 'A plan with this slug already exists.' });
    // Copy free-plan features as a sane starting point (billing integrates later).
    const { data: freeFeats } = await admin.from('plan_features').select('feature_key,value').eq('plan_id', (await admin.from('plans').select('id').eq('slug', 'free').single()).data?.id || '');
    if (freeFeats?.length) {
      await admin.from('plan_features').insert(freeFeats.map((f) => ({ plan_id: data.id, feature_key: f.feature_key, value: f.value })));
    }
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'plan.change', target_type: 'plan', target_id: data.id, metadata: { slug: data.slug }, ip: clientIp(req) });
    return res.status(201).json({ plan: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
