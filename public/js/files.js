// MARKLEY Phase 3 client: signed-URL uploads (browser never talks to Storage directly).
import { getSupabase } from './supabase-client.js';

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

async function authed(session, path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(opts.headers || {}) },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || 'Something went wrong. Please try again.');
  return b;
}

// Full flow for one file: validate server-side, PUT bytes to the signed URL, return ref.
export async function uploadOne(session, { purpose, class_id, assignment_id, file }) {
  const { bucket, path, token } = await authed(session, '/api/files/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      purpose, class_id, assignment_id,
      name: file.name, mime: file.type || 'application/octet-stream', size: file.size,
    }),
  });
  const sb = await getSupabase();
  const { error } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) throw new Error('Upload failed. Please try again.');
  return { path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size };
}

export async function uploadMany(session, args, files, onOne) {
  const out = [];
  for (const file of files) {
    const ref = await uploadOne(session, { ...args, file });
    out.push(ref);
    onOne?.(ref);
  }
  return out;
}
