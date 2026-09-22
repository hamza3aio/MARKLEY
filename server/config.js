// GET /api/config — public Supabase anon config only. Never leaks service key.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server is not configured. Please try again.' });
  }
  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
