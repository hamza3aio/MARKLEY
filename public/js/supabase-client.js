// Shared Supabase browser client. Config comes from /api/config (anon key only).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

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
  const { supabaseUrl, supabaseAnonKey } = await getConfig();
  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}
