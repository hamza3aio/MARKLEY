// MARKLEY plans engine (Phase 9, server-side only).
// Feature flags + limits enforced here — never hard-coded in the frontend.
// Admins bypass gates (they manage the plans). Students/parents stay on the
// default free plan and can never be assigned a paid plan.

export const LIMITS = ['classes.max', 'students_per_class.max', 'storage_mb.max', 'ai_monthly.max'];
export const FLAGS = ['ai_tools', 'exports', 'analytics', 'leaderboard', 'sessions'];
export const FEATURES = [...LIMITS, ...FLAGS];

export function planLimitError(feature, limit, used) {
  const e = new Error('Your plan does not allow this. Contact sales for a custom plan.');
  e.status = 402;
  e.code = 'plan_limit';
  e.feature = feature;
  e.limit = limit;
  e.used = used;
  return e;
}

export function sendPlanError(res, e) {
  if (e && e.code === 'plan_limit') {
    res.status(402).json({ error: e.message, code: e.code, feature: e.feature, limit: e.limit, used: e.used });
    return true;
  }
  return false;
}

// Shared AI gate: ai_tools flag + monthly quota. Admins bypass.
// Returns null when allowed, otherwise sends the response and returns true.
export async function checkAIGate(admin, profile, user, res) {
  if (profile.role === 'admin') return null;
  try {
    await requireFlag(admin, profile, 'ai_tools');
    const { features } = await getPlan(admin, user.id);
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count } = await admin.from('ai_requests').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthStart.toISOString());
    if ((count ?? 0) >= (features['ai_monthly.max'] ?? 50)) throw planLimitError('ai_monthly.max', features['ai_monthly.max'] ?? 50, count ?? 0);
    return null;
  } catch (e) {
    if (sendPlanError(res, e)) return true;
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return true;
  }
}

export async function getPlan(admin, user_id) {
  const { data: up } = await admin.from('user_plans').select('plan_id').eq('user_id', user_id).single();
  let plan;
  if (up) {
    ({ data: plan } = await admin.from('plans').select('*').eq('id', up.plan_id).single());
  }
  if (!plan) {
    ({ data: plan } = await admin.from('plans').select('*').eq('slug', 'free').single());
  }
  if (!plan) return { plan: null, features: {} };
  const { data: feats } = await admin.from('plan_features').select('*').eq('plan_id', plan.id);
  return { plan, features: Object.fromEntries((feats || []).map((f) => [f.feature_key, f.value])) };
}

export async function requireFlag(admin, profile, feature) {
  if (profile.role === 'admin') return;
  const { features } = await getPlan(admin, profile.id);
  if (!features[feature]) throw planLimitError(feature, 0, 1);
}

export async function usage(admin, user_id) {
  const { plan, features } = await getPlan(admin, user_id);
  const { count: classes } = await admin.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', user_id).is('deleted_at', null);
  let bytes = 0;
  const { data: f1 } = await admin.from('files').select('size_bytes').eq('uploaded_by', user_id);
  (f1 || []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  const { data: subs } = await admin.from('assignment_submissions').select('id').eq('student_id', user_id);
  if (subs?.length) {
    const { data: sf } = await admin.from('submission_files').select('size_bytes').in('submission_id', subs.map((s) => s.id));
    (sf || []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  }
  const { data: mine } = await admin.from('assignments').select('id').eq('created_by', user_id).is('deleted_at', null);
  if (mine?.length) {
    const { data: af } = await admin.from('assignment_attachments').select('size_bytes').in('assignment_id', mine.map((a) => a.id));
    (af || []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  }
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const { count: ai } = await admin.from('ai_requests').select('id', { count: 'exact', head: true }).eq('user_id', user_id).gte('created_at', monthStart.toISOString());
  return {
    plan: plan ? { name: plan.name, slug: plan.slug, price_monthly: plan.price_monthly } : null,
    features,
    used: { classes: classes ?? 0, storage_mb: Math.round((bytes / 1048576) * 10) / 10, ai_monthly: ai ?? 0 },
  };
}
