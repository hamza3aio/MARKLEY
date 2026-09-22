# Security model

- JWT verified server-side on every `/api` call via `auth.getUser(token)`.
- Email verification enforced in `/api/me` (`email_confirmed_at`).
- Suspended/pending/deleted accounts rejected server-side.
- RLS: browser can only SELECT own profile + own logs + catalogues. Zero browser writes.
- `/api/profile` allow-lists `full_name` + `theme` + `email_notifications`; role/status immutable by self.
- `/api/activity` allow-lists actions; IP recorded server-side from headers/socket, not client input.
- Upload confirms verify bytes exist (`objectExists`) — no dangling rows.
- Hot routes rate-limited (`api/_lib/rate.js`, per-instance; see `docs/AUDIT.md`).
- CSRF N/A (Bearer tokens, no cookies). Login brute-force owned by Supabase Auth.
- Secrets: service-role/Resend/AI keys in Vercel env only. CSP + HSTS in `vercel.json`.
- Errors are generic; no SQL/stack/key leakage.
- Full audit: `docs/AUDIT.md`. Test plan: `docs/TESTING.md`.
