// /api/invitations/accept — POST { token }: join class via invitation.
// Validates token, expiry, email match, role match, single-use. IDOR-safe.
import { authContext, logActivity, clientIp } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const { token } = req.body || {};
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return res.status(400).json({ error: 'Invalid invitation.' });
  }

  const { data: invite } = await admin.from('class_invitations').select('*').eq('token', token.trim()).single();
  if (!invite) return res.status(404).json({ error: 'Invitation not found.' });
  if (invite.status !== 'pending') {
    return res.status(410).json({ error: `Invitation is ${invite.status}.` });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from('class_invitations').update({ status: 'expired' }).eq('id', invite.id);
    return res.status(410).json({ error: 'Invitation has expired.' });
  }
  // Email must match the invited address (prevents token-sharing hijack).
  if ((profile.email || '').toLowerCase() !== (invite.email || '').toLowerCase()) {
    return res.status(403).json({ error: 'This invitation was sent to a different email address.' });
  }
  // Global role must match invited class role.
  if (profile.role !== invite.role_in_class) {
    return res.status(403).json({ error: `This invitation is for a ${invite.role_in_class} account.` });
  }
  const { data: cls } = await admin.from('classes').select('id').eq('id', invite.class_id).is('deleted_at', null).single();
  if (!cls) return res.status(404).json({ error: 'Class no longer exists.' });

  const { data: existing } = await admin.from('class_members')
    .select('id,status').eq('class_id', invite.class_id).eq('user_id', user.id).single();
  if (existing?.status === 'active') {
    // Idempotent: already joined; consume single-use invite.
    if (invite.single_use) {
      await admin.from('class_invitations')
        .update({ status: 'accepted', accepted_by: user.id, accepted_at: new Date().toISOString() })
        .eq('id', invite.id);
    }
    return res.status(200).json({ ok: true, class_id: invite.class_id, already: true });
  }

  if (existing) {
    await admin.from('class_members').update({ status: 'active', joined_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    const { error } = await admin.from('class_members').insert({
      class_id: invite.class_id, user_id: user.id,
      role_in_class: invite.role_in_class, invited_by: invite.invited_by,
    });
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  await admin.from('class_invitations')
    .update({ status: 'accepted', accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  await logActivity(admin, {
    actor_id: user.id, actor_role: profile.role, action: 'invitation.accept',
    target_type: 'class', target_id: invite.class_id,
    metadata: { invitation_id: invite.id }, ip: clientIp(req),
  });
  return res.status(200).json({ ok: true, class_id: invite.class_id });
}
