// PUT /api/plans/:id/features — replace feature set wholesale (plans.manage).
// Body: { features: { "classes.max": 10, "ai_tools": 1, ... } }
import { authContext, hasPerm, isAdmin, logActivity, clientIp } from '../../../_lib/auth.js';
import { FEATURES } from '../../../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
  if (!isAdmin(profile) && !hasPerm(permissions, 'plans.manage')) {
    return res.status(403).json({ error: 'You do not have permission to manage plans.' });
  }
  const { data: plan } = await admin.from('plans').select('id').eq('id', id).single();
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  const { features } = req.body || {};
  if (typeof features !== 'object' || !features) return res.status(400).json({ error: 'Invalid request.' });
  const rows = [];
  for (const key of FEATURES) {
    if (features[key] === undefined) continue;
    const v = Number(features[key]);
    if (!Number.isInteger(v) || v < 0) return res.status(400).json({ error: `Invalid value for ${key}.` });
    if ((key === 'ai_tools' || key === 'exports' || key === 'analytics' || key === 'leaderboard' || key === 'sessions') && v > 1) {
      return res.status(400).json({ error: `${key} must be 0 or 1.` });
    }
    if (v > 1000000) return res.status(400).json({ error: `Invalid value for ${key}.` });
    rows.push({ plan_id: id, feature_key: key, value: v });
  }
  if (!rows.length) return res.status(400).json({ error: 'No known features provided.' });
  // Merge: upsert provided keys, keep the rest untouched.
  const { error } = await admin.from('plan_features').upsert(rows, { onConflict: 'plan_id,feature_key' });
  if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'plan.change', target_type: 'plan', target_id: id, metadata: { features: rows.map((r) => r.feature_key) }, ip: clientIp(req) });
  const { data } = await admin.from('plan_features').select('*').eq('plan_id', id);
  return res.status(200).json({ features: Object.fromEntries((data || []).map((f) => [f.feature_key, f.value])) });
}
