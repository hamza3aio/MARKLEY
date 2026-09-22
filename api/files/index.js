// /api/files — GET ?class_id= list content (+ signed download URLs).
// POST confirm a content upload { class_id, path, name, mime, size, description?, visibility? }.
import { authContext, hasPerm, isAdmin, logActivity, clientIp, activeMembership } from '../_lib/auth.js';
import { PURPOSE, validateFile, signedDownload } from '../_lib/files.js';

export default async function handler(req, res) {
  const ctx = await authContext(req, res);
  if (!ctx) return;
  const { user, profile, permissions, admin } = ctx;

  if (req.method === 'GET') {
    const class_id = req.query?.class_id;
    if (typeof class_id !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const member = await activeMembership(admin, class_id, user.id);
    if (!member && !isAdmin(profile)) {
      if (profile.role !== 'parent') return res.status(403).json({ error: 'You do not have access to this class.' });
      const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', user.id).eq('status', 'active');
      const sids = (links || []).map((l) => l.student_id);
      let ok = false;
      if (sids.length) {
        const { data: m } = await admin.from('class_members').select('id').eq('class_id', class_id).in('user_id', sids).eq('status', 'active').limit(1);
        ok = !!(m && m.length);
      }
      if (!ok) return res.status(403).json({ error: 'You do not have access to this class.' });
    }
    const q = admin.from('files').select('id,name,description,mime,size_bytes,storage_path,visibility,uploaded_by,created_at').eq('class_id', class_id).order('created_at', { ascending: false }).limit(200);
    // Students/parents never see teacher-only files.
    const { data: files, error } = (member && member.role_in_class === 'student') || profile.role === 'parent'
      ? await q.eq('visibility', 'class')
      : await q;
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    const out = await Promise.all((files || []).map(async (f) => ({
      ...f, downloadUrl: await signedDownload(admin, PURPOSE.content.bucket, f.storage_path),
    })));
    return res.status(200).json({ files: out });
  }

  if (req.method === 'POST') {
    const { class_id, path, name, mime, size, description = '', visibility = 'class' } = req.body || {};
    if (typeof class_id !== 'string' || typeof path !== 'string') return res.status(400).json({ error: 'Invalid request.' });
    const { data: cls } = await admin.from('classes').select('id,teacher_id').eq('id', class_id).is('deleted_at', null).single();
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const member = await activeMembership(admin, class_id, user.id);
    const ok = isAdmin(profile) || cls.teacher_id === user.id ||
      (!!member && (member.role_in_class === 'assistant' || member.role_in_class === 'teacher') && hasPerm(permissions, 'content.upload'));
    if (!ok) return res.status(403).json({ error: 'You do not have permission to upload content.' });
    const err = validateFile('content', name, mime, size);
    if (err) return res.status(400).json({ error: err });
    if (!path.startsWith(`class/${class_id}/content/`)) return res.status(400).json({ error: 'Invalid upload path.' });
    if (typeof description !== 'string' || description.length > 1000) return res.status(400).json({ error: 'Description is too long.' });
    if (!['class', 'teachers'].includes(visibility)) return res.status(400).json({ error: 'Invalid visibility.' });
    const { data, error } = await admin.from('files').insert({
      class_id, uploaded_by: user.id, name: String(name).trim(), description: description.trim(),
      mime, size_bytes: size, storage_path: path, visibility,
    }).select().single();
    if (error) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    await logActivity(admin, { actor_id: user.id, actor_role: profile.role, action: 'file.upload', target_type: 'class', target_id: class_id, metadata: { file_id: data.id, name: data.name }, ip: clientIp(req) });
    return res.status(201).json({ file: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
