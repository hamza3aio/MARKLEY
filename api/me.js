// GET /api/me — verify Supabase JWT server-side, return profile + permissions.
// Never trust frontend role. Requires: Authorization: Bearer <access_token>
import { createClient } from '@supabase/supabase-js';

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Server is not configured. Please try again.' });
  }

  try {
    const userClient = createClient(url, anon, { auth: { persistSession: false } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    if (!user.email_confirmed_at) {
      return res.status(403).json({ error: 'Please verify your email before accessing the platform.', code: 'email_unverified' });
    }

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: pErr } = await admin
      .from('profiles').select('id,email,full_name,role,status,theme,created_at').eq('id', user.id).single();
    if (pErr || !profile) return res.status(403).json({ error: 'Account not provisioned. Contact admin.' });
    if (profile.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active. Contact admin.', code: 'account_' + profile.status });
    }

    const { data: perms } = await admin.from('role_permissions').select('permission').eq('role', profile.role);
    const permissions = (perms || []).map((r) => r.permission);

    return res.status(200).json({ user: { id: user.id, email: user.email }, profile, permissions });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
