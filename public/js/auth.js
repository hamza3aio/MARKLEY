// MARKLEY auth: Supabase email/password + verification gate + server role check.
import { getSupabase, getSession } from './supabase-client.js';

export async function fetchMe(session) {
  const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + session.access_token } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body; // { user, profile, permissions }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    location.href = '/login.html';
    throw new Error('redirect');
  }
  const me = await fetchMe(session).catch((e) => {
    if (/verify your email/i.test(e.message)) location.href = '/verify.html';
    else if (/not authenticated|expired/i.test(e.message)) location.href = '/login.html';
    throw e;
  });
  return { session, ...me };
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error));
  return data.session;
}

export async function signUp(fullName, email, password) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() }, emailRedirectTo: location.origin + '/login.html' },
  });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function signOut() {
  const sb = await getSupabase();
  const session = (await sb.auth.getSession()).data.session;
  if (session) {
    try {
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch { /* non-blocking */ }
  }
  await sb.auth.signOut();
  location.href = '/login.html';
}

function friendlyAuthError(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Invalid email or password.';
  if (m.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait and try again.';
  if (m.includes('password')) return 'Password does not meet requirements.';
  return 'Something went wrong. Please try again.';
}
