// Best-effort per-instance rate limiter for hot /api routes (Vercel Node, ESM).
// Note: serverless instances don't share memory, so this blunts casual abuse;
// Supabase Auth still owns login brute-force protection. Returns true when limited.
const buckets = new Map();

export function rateLimit(req, res, { windowMs = 60000, max = 20, prefix = '' } = {}) {
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown').slice(0, 64);
  const key = `${prefix}:${ip}`;
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  cur.count += 1;
  if (cur.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((cur.reset - now) / 1000)));
    res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    return true;
  }
  if (buckets.size > 5000) buckets.clear();
  return false;
}
