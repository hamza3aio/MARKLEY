// Shared server-side auth for /api (Vercel Node, ESM).
// Every endpoint: verify Supabase JWT, load profile + role_permissions, enforce.
import { createClient } from '@supabase/supabase-js';

export function getBearer(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export function clientIp(req) {
  const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket?.remoteAddress || null;
}

export function services() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return { configError: true };
  const userClient = createClient(url, anon, { auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  return { userClient, admin };
}

export async function authContext(req, res) {
  const s = services();
  if (s.configError) {
    res.status(500).json({ error: 'Server is not configured. Please try again.' });
    return null;
  }
  const token = getBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return null;
  }
  const { data: { user } } = await s.userClient.auth.getUser(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return null;
  }
  const { data: profile } = await s.admin
    .from('profiles').select('id,email,full_name,role,status').eq('id', user.id).single();
  if (!profile || profile.status !== 'active') {
    res.status(403).json({ error: 'Account is not active. Contact admin.' });
    return null;
  }
  const { data: rows } = await s.admin.from('role_permissions').select('permission').eq('role', profile.role);
  const permissions = (rows || []).map((r) => r.permission);
  return { user, profile, permissions, admin: s.admin };
}

export const hasPerm = (permissions, key) => permissions.includes(key);
export const isAdmin = (profile) => profile.role === 'admin';

export async function logActivity(admin, entry) {
  try {
    await admin.from('activity_logs').insert({
      metadata: {},
      ...entry,
    });
  } catch { /* logging never breaks the request */ }
}

export async function isClassTeacher(admin, classId, userId) {
  const { data } = await admin.from('classes').select('id,teacher_id').eq('id', classId).is('deleted_at', null).single();
  return data && data.teacher_id === userId ? data : null;
}

export async function activeMembership(admin, classId, userId) {
  const { data } = await admin.from('class_members')
    .select('id,role_in_class').eq('class_id', classId).eq('user_id', userId).eq('status', 'active').single();
  return data || null;
}

export function validEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.trim().length <= 254;
}
