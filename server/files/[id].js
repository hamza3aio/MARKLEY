// /api/files/:id — PATCH rename {name?, description?, visibility?}, DELETE remove.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';
import { PURPOSE } from '../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;
  const { id } = req.query || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid request.' });

  const { data: f } = await admin.from('files').select('*').eq('id', id).single();
  if (!f) return res.status(404).json({ error: 'File not found.' });
  const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', f.class_id).single();
  const member = await activeMembership(admin, f.class_id, user.id);
  const manager = isAdmin(profile) || cls?.teacher_id === user.id || f.uploaded_by === user.id ||
    (!!member && member.role_in_class === 'assistant' && hasPerm(permissions, 'content.upload'));
  if (!manager) return res.status(403).json({ error: 'You do not have permission to manage this file.' });

  if (req.method === 'PATCH') {
    const { name, description, visibility } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) return res.status(400).json({ error: 'Invalid file name.' });
      patch.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 1000) return res.status(400).json({ error: 'Description is too long.' });
      patch.description = description.trim();
    }
    if (visibility !== undefined) {
      if (!['class', 'teachers'].includes(visibility)) return res.status(400).json({ error: 'Invalid visibility.' });
      patch.visibility = visibility;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const { data, error } = await admin.from('files').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(200).json({ file: data });
  }

  if (req.method === 'DELETE') {
    await admin.storage.from(PURPOSE.content.bucket).remove([f.storage_path]);
    await admin.from('files').delete().eq('id', id);
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'file.delete', target_type: 'class', target_id: f.class_id, metadata: { file_id: id, name: f.name }, ip: clientIp(req) });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
