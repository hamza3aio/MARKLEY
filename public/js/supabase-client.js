// Shared Supabase browser client. Config comes from /api/config (anon key only).
// supabase-js loads from CDN with fallback — login must never die silently.
const CDNS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://esm.sh/@supabase/supabase-js@2',
];
let createClientFn = null;
async function loadClient() {
  if (createClientFn) return createClientFn;
  let lastErr = null;
  for (const url of CDNS) {
    try {
      const mod = await import(/* @vite-ignore */url);
      createClientFn = mod.createClient;
      return createClientFn;
    } catch (e) { lastErr = e; }
  }
  throw new Error('Login libraries failed to load. Check your connection and reload. ' + (lastErr?.message || ''));
}

let client = null;
let cfg = null;

export async function getConfig() {
  if (cfg) return cfg;
  const r = await fetch('/api/config', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Server is not configured. Please try again.');
  cfg = await r.json();
  return cfg;
}

export async function getSupabase() {
  if (client) return client;
  const createClient = await loadClient();
  const { supabaseUrl, supabaseAnonKey } = await getConfig();
  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}
