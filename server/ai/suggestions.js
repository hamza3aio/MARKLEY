// /api/ai/suggestions — GET pending suggestions (staff, ?assignment_id=).
// /api/ai/suggestions/:id/resolve — POST { decision: approve|modify|reject, score?, feedback? }.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const { assignment_id } = req.query || {};
    if (typeof assignment_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const { data: asg } = await admin.from('assignments').select('id,class_id').eq('id', assignment_id).single();
    if (!asg) return res.status(404).json({ error: 'Assignment not found.' });
    const member = await activeMembership(admin, asg.class_id, user.id);
    const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', asg.class_id).single();
    const staff = isAdmin(profile) || cls?.teacher_id === user.id ||
      (!!member && (member.role_in_class === 'teacher' || member.role_in_class === 'assistant'));
    if (!staff) return res.status(403).json({ error: 'Only class staff can view suggestions.' });
    const { data } = await admin.from('ai_grading_suggestions').select('*').eq('assignment_id', assignment_id).eq('status', 'pending').order('created_at', { ascending: false });
    return res.status(200).json({ suggestions: data || [] });
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed.' });
}
