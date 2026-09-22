import { getSession } from './supabase-client.js';

// Apply saved theme (persisted in profiles.theme via /api/profile).
export function applyTheme(theme) {
  if (!theme) return;
  const r = document.documentElement.style;
  if (theme.primary) r.setProperty('--primary', theme.primary);
  if (theme.secondary) r.setProperty('--secondary', theme.secondary);
  document.documentElement.dataset.mode = theme.mode || 'light';
}

export async function loadThemeFromServer(session) {
  try {
    const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + session.access_token } });
    if (!r.ok) return;
    const { profile } = await r.json();
    if (profile?.theme) {
      applyTheme(profile.theme);
      localStorage.setItem('markley.theme', JSON.stringify(profile.theme));
    }
  } catch { /* offline-safe */ }
}

export async function initTheme() {
  try {
    const cached = JSON.parse(localStorage.getItem('markley.theme') || 'null');
    if (cached) applyTheme(cached);
  } catch { /* ignore */ }
  const session = await getSession().catch(() => null);
  if (session) await loadThemeFromServer(session);
}
