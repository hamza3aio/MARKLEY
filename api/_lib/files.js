// Shared file-validation + signed-URL helpers for Phase 3 (Vercel Node, ESM).
// Browser never touches Storage directly: /api mints signed upload/download URLs
// (service-role) after validating permission, extension, MIME and size.

const BLOCKED_EXT = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'js', 'mjs', 'html', 'htm', 'php', 'sh', 'ps1', 'dll', 'so', 'dylib']);
const BLOCKED_MIME_PREFIX = ['application/x-msdownload', 'application/x-sh', 'text/html', 'application/javascript'];

export const PURPOSE = {
  content: { bucket: 'class-files', maxBytes: 52428800, mimes: new Set([
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])},
  assignment: { bucket: 'assignment-files', maxBytes: 26214400, mimes: new Set([
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])},
  submission: { bucket: 'assignment-files', maxBytes: 26214400, mimes: new Set([
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])},
};

export function sanitizeName(name) {
  return String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 255);
}

export function validateFile(purpose, name, mime, size) {
  const cfg = PURPOSE[purpose];
  if (!cfg) return 'Invalid upload purpose.';
  const clean = sanitizeName(name);
  if (!clean) return 'File name is required.';
  const ext = (clean.split('.').pop() || '').toLowerCase();
  if (!ext || BLOCKED_EXT.has(ext)) return 'File type is not allowed.';
  if (typeof mime !== 'string' || !cfg.mimes.has(mime)) return 'File type is not allowed.';
  if (BLOCKED_MIME_PREFIX.some((p) => mime.startsWith(p))) return 'File type is not allowed.';
  if (!Number.isInteger(size) || size <= 0 || size > cfg.maxBytes) {
    return `File must be 1 byte to ${Math.round(cfg.maxBytes / 1048576)} MB.`;
  }
  return null;
}

export function buildPath(prefix, name) {
  const clean = sanitizeName(name).replace(/\s+/g, '-');
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}/${rand}-${clean}`.slice(0, 500);
}

export async function signedUpload(admin, bucket, path) {
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error('Could not prepare upload. Please try again.');
  return data; // { signedUrl, token, path }
}

export async function signedDownload(admin, bucket, path, expiresIn = 3600) {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
