// /api/plan-requests — GET inbox (plans.manage), POST contact sales (any active user).
import { authContext, hasPerm, isAdmin, validEmail } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    if (!isAdmin(profile) && !hasPerm(permissions, 'plans.manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage plans.' });
    }
    const { data, error } = await admin.from('plan_requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ requests: data || [] });
  }

  if (req.method === 'POST') {
    if (profile.role !== 'teacher' && profile.role !== 'admin' && profile.role !== 'assistant') {
      return res.status(403).json({ error: 'Custom plans are for teachers and schools.' });
    }
    const { name, email, organization = '', message } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      return res.status(400).json({ error: 'Name must be 2-120 characters.' });
    }
    if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
    if (typeof organization !== 'string' || organization.length > 200) return res.status(400).json({ error: 'Organization is too long.' });
    if (typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 3000) {
      return res.status(400).json({ error: 'Message must be 10-3000 characters.' });
    }
    const { count } = await admin.from('plan_requests').select('id', { count: 'exact', head: true }).eq('created_by', user.id).eq('status', 'pending');
    if ((count ?? 0) >= 3) return res.status(429).json({ error: 'You already have open requests. Please wait for a reply.' });
    const { data, error } = await admin.from('plan_requests').insert({
      created_by: user.id, name: name.trim(), email: email.trim().toLowerCase(),
      organization: organization.trim(), message: message.trim(),
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(201).json({ request: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
