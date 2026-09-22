// /api/invitations — GET my pending invites + (teacher/admin) invites for my classes.
import { authContext, isAdmin } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, admin } = ctx;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const myEmail = (profile.email || '').toLowerCase();
  const { data: mine } = await admin.from('class_invitations')
    .select('id,class_id,role_in_class,status,expires_at,created_at')
    .eq('email', myEmail).eq('status', 'pending').gt('expires_at', new Date().toISOString());

  let classNames = {};
  const allIds = [...new Set((mine || []).map((i) => i.class_id))];

  let sent = [];
  if (profile.role === 'teacher' || profile.role === 'assistant' || isAdmin(profile)) {
    let classIds = [];
    if (isAdmin(profile)) {
      const { data: all } = await admin.from('classes').select('id').is('deleted_at', null).limit(500);
      classIds = (all || []).map((c) => c.id);
    } else {
      const { data: ms } = await admin.from('class_members')
        .select('class_id').eq('user_id', user.id).eq('status', 'active');
      classIds = [...new Set((ms || []).map((m) => m.class_id))];
    }
    if (classIds.length) {
      const { data } = await admin.from('class_invitations')
        .select('id,class_id,email,role_in_class,status,expires_at,created_at')
        .in('class_id', classIds).eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
      sent = data || [];
      sent.forEach((i) => allIds.push(i.class_id));
    }
  }

  if (allIds.length) {
    const { data: classes } = await admin.from('classes').select('id,name,subject').in('id', [...new Set(allIds)]);
    classNames = Object.fromEntries((classes || []).map((c) => [c.id, c]));
  }

  return res.status(200).json({
    received: (mine || []).map((i) => ({ ...i, class: classNames[i.class_id] || null })),
    sent: sent.map((i) => ({ ...i, class: classNames[i.class_id] || null })),
  });
}
