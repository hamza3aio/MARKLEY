// /api/activity — Phase 1 activity log (service-role writes, RLS-safe).
// POST: log allow-listed client actions. GET: own recent logs (admin w/ permission: global).
import { createClient } from '@supabase/supabase-js';

const ALLOW_ACTIONS = new Set(['login', 'logout', 'profile.update', 'theme.update', 'page.view']);

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
function clientIp(req) {
  const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Server is not configured. Please try again.' });
  }
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const userClient = createClient(url, anon, { auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile } = await admin.from('profiles').select('id,role,status').eq('id', user.id).single();
    if (!profile || profile.status !== 'active') return res.status(403).json({ error: 'Account is not active.' });

    if (req.method === 'POST') {
      const { action, target_type = null, target_id = null, metadata = {} } = req.body || {};
      if (typeof action !== 'string' || !ALLOW_ACTIONS.has(action)) {
        return res.status(400).json({ error: 'Invalid action.' });
      }
      if (target_type && (typeof target_type !== 'string' || target_type.length > 64)) {
        return res.status(400).json({ error: 'Invalid request.' });
      }
      const row = {
        actor_id: user.id, actor_role: profile.role, action,
        target_type, target_id: target_id ? String(target_id).slice(0, 128) : null,
        metadata: typeof metadata === 'object' && metadata ? metadata : {},
        ip: clientIp(req),
      };
      const { error } = await admin.from('activity_logs').insert(row);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'GET') {
      const { data: perms } = await admin.from('role_permissions').select('permission').eq('role', profile.role);
      const canGlobal = (perms || []).some((r) => r.permission === 'activity.view_global');
      const q = admin.from('activity_logs')
        .select('id,action,target_type,target_id,metadata,created_at,actor_role')
        .order('created_at', { ascending: false }).limit(50);
      const { data, error } = canGlobal ? await q : await q.eq('actor_id', user.id);
      if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      return res.status(200).json({ logs: data || [] });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
