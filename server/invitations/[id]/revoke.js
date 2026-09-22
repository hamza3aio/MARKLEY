// /api/invitations/:id/revoke — POST revoke a pending invitation.
// Access: admin or teacher owner of the class.
import { authContext, isAdmin, logActivity, clientIp } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  const { id } = req.query || {};
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: invite } = await admin.from('class_invitations').select('*').eq('id', id).single();
  if (!invite) return res.status(404).json({ error: 'Invitation not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', invite.class_id).single();
  const can = isAdmin(profile) || (cls && cls.teacher_id === user.id);
  if (!can) return res.status(403).json({ error: 'You do not have permission to revoke this invitation.' });
  if (invite.status !== 'pending') return res.status(409).json({ error: `Invitation is already ${invite.status}.` });

  await admin.from('class_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id);
  await logActivity(admin, {
    actor_id: user.id, actor_role: profile.role, action: 'invitation.revoke',
    target_type: 'class', target_id: invite.class_id,
    metadata: { invitation_id: id, email: invite.email }, ip: clientIp(req),
  });
  return res.status(200).json({ ok: true });
}
