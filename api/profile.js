// PATCH /api/profile — allow-listed self-service fields only.
// Role/status/email changes are admin-only (future /api/admin). Never trust client role.
import { createClient } from '@supabase/supabase-js';

function getBearer(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
function validHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return res.status(500).json({ error: 'Server is not configured. Please try again.' });

  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const { full_name, theme } = req.body || {};
  const patch = {};
  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || full_name.trim().length > 120) {
      return res.status(400).json({ error: 'Invalid name.' });
    }
    patch.full_name = full_name.trim();
  }
  if (theme !== undefined) {
    if (typeof theme !== 'object' || !theme || !validHex(theme.primary) || !validHex(theme.secondary) || !['light', 'dark'].includes(theme.mode)) {
      return res.status(400).json({ error: 'Invalid theme.' });
    }
    patch.theme = { primary: theme.primary, secondary: theme.secondary, mode: theme.mode };
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });

  try {
    const userClient = createClient(url, anon, { auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: cur } = await admin.from('profiles').select('id,status').eq('id', user.id).single();
    if (!cur || cur.status !== 'active') return res.status(403).json({ error: 'Account is not active.' });

    const { data, error } = await admin.from('profiles').update(patch).eq('id', user.id)
      .select('id,email,full_name,role,status,theme').single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

    await admin.from('activity_logs').insert({
      actor_id: user.id, action: 'profile.update', metadata: { fields: Object.keys(patch) },
    });
    return res.status(200).json({ profile: data });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
