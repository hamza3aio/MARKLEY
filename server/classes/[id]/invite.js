// /api/classes/:id/invite — POST create invitation (admin, owner teacher, or
// assistant member with class.invite). Enforces single-use + expiry + revocation model.
import { randomBytes } from 'node:crypto';
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership, validEmail } from '../../_lib/auth.js';
import { notifyUsers, sendEmail, appLink } from '../../_lib/email.js';
import { getPlan, planLimitError, sendPlanError } from '../../_lib/plans.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: cls } = await admin.from('classes').select('id,name,teacher_id').eq('id', id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class not found.' });

  const member = await activeMembership(admin, id, user.id);
  const owner = cls.teacher_id === user.id;
  const canInvite =
    isAdmin(profile) || owner ||
    (!!member && (member.role_in_class === 'assistant' || member.role_in_class === 'teacher') && hasPerm(permissions, 'class.invite'));
  if (!canInvite) return res.status(403).json({ error: 'You do not have permission to invite to this class.' });

  const { email, role_in_class, expires_in_days = 7 } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (!['assistant', 'student'].includes(role_in_class)) {
    return res.status(400).json({ error: 'Role must be assistant or student.' });
  }
  const days = Number(expires_in_days);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return res.status(400).json({ error: 'Expiry must be 1-30 days.' });
  }

  const normEmail = email.trim().toLowerCase();
  // Plan gate: students in class (+ pending student invites) vs owner's limit.
  try {
    const { data: owner } = await admin.from('profiles').select('role').eq('id', cls.teacher_id).single();
    if (owner?.role !== 'admin' && role_in_class === 'student') {
      const { features } = await getPlan(admin, cls.teacher_id);
      const { count: inClass } = await admin.from('class_members').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('role_in_class', 'student').eq('status', 'active');
      const { count: pending } = await admin.from('class_invitations').select('id', { count: 'exact', head: true }).eq('class_id', id).eq('role_in_class', 'student').eq('status', 'pending');
      const used = (inClass ?? 0) + (pending ?? 0);
      if (used >= (features['students_per_class.max'] ?? 50)) throw planLimitError('students_per_class.max', features['students_per_class.max'] ?? 50, used);
    }
  } catch (e) {
    if (sendPlanError(res, e)) return;
  }
  // Already an active member?
  const { data: existing } = await admin.from('profiles').select('id').eq('email', normEmail).single();
  if (existing) {
    const m = await activeMembership(admin, id, existing.id);
    if (m) return res.status(409).json({ error: 'This user is already in the class.' });
  }

  const token = randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();
  const { data: invite, error } = await admin.from('class_invitations').insert({
    class_id: id, email: normEmail, role_in_class, token,
    single_use: true, status: 'pending', expires_at, invited_by: user.id,
  }).select('id,email,role_in_class,status,expires_at,created_at').single();
  if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

  await logActivity(admin, {
    actor_id: user.id, actor_role: profile.role, action: 'class.invite',
    target_type: 'class', target_id: id,
    metadata: { email: normEmail, role: role_in_class }, ip: clientIp(req),
  });
  // In-app + email notification if the invitee already has an account.
  const link = appLink(`/invite.html?token=${token}`);
  if (existing) {
    await notifyUsers(admin, { user_ids: [existing.id], type: 'invitation', title: `Class invitation: ${cls.name}`, body: `You were invited as ${role_in_class}.`, link });
    sendEmail(admin, [existing.id], `Class invitation: ${cls.name}`, `You are invited to ${cls.name}`, `<p>You were invited as <b>${role_in_class}</b>.</p>`, link).catch(() => {});
  }
  return res.status(201).json({ invitation: invite, token });
}
