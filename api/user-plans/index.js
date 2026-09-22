// /api/user-plans — GET my plan + usage, POST assign plan (plans.manage).
// Paid plans can never be assigned to students/parents.
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../_lib/auth.js';
import { usage } from '../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    return res.status(200).json(await usage(admin, user.id));
  }

  if (req.method === 'POST') {
    if (!isAdmin(profile) && !hasPerm(permissions, 'plans.manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage plans.' });
    }
    const { user_email, plan_slug } = req.body || {};
    if (typeof user_email !== 'string' || typeof plan_slug !== 'string') {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    const { data: target } = await admin.from('profiles').select('id,role,status').eq('email', user_email.trim().toLowerCase()).single();
    if (!target || target.status !== 'active') return res.status(400).json({ error: 'User not found or not active.' });
    const { data: plan } = await admin.from('plans').select('*').eq('slug', plan_slug.trim()).eq('is_active', true).single();
    if (!plan) return res.status(400).json({ error: 'Plan not found or inactive.' });
    if ((target.role === 'student' || target.role === 'parent') && (plan.price_monthly || 0) > 0) {
      return res.status(400).json({ error: 'Students and parents are never charged.' });
    }
    if (target.role === 'student' || target.role === 'parent') {
      return res.status(400).json({ error: 'Students and parents use the free plan automatically.' });
    }
    await admin.from('user_plans').upsert({ user_id: target.id, plan_id: plan.id, assigned_by: user.id }, { onConflict: 'user_id' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'plan.assign', target_type: 'user', target_id: target.id, metadata: { plan: plan.slug }, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
