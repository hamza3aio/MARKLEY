# Architecture (Vercel-native, no PHP)

Owner decision: drop PHP so the whole app hosts on Vercel.

```
Browser (public/, HTML/CSS/JS)
  │  fetch /api/config → { SUPABASE_URL, ANON_KEY } (public only)
  │  Supabase Auth directly (email verification, sessions)
  ▼
Vercel Serverless (`api/[...route].js` single catch-all → `server/` handlers, Node)
  │  validates Supabase JWT on every call
  │  uses SERVICE_ROLE (server env only) for DB access
  │  re-checks role_permissions — never trusts client role
  ▼
Supabase (Postgres + RLS + Auth + Storage [Phase 3])
```

- Frontend is static, CSP-hardened (`vercel.json`).
- `/api/me` = identity + permissions. `/api/profile` = allow-listed self updates.
- `/api/activity` = allow-listed log writes + scoped reads.
- AI (deferred): future `/api/ai/*` calling provider server-side with usage tracking; keys never reach browser.
- Email (Phase 5): future `/api/email/*` via Resend abstraction, keys server-only.
