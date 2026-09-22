# Security model (Phase 1)

- JWT verified server-side on every `/api` call via `auth.getUser(token)`.
- Email verification enforced in `/api/me` (`email_confirmed_at`).
- Suspended/pending/deleted accounts rejected server-side.
- RLS: browser can only SELECT own profile + own logs + catalogues. Zero browser writes.
- `/api/profile` allow-lists `full_name` + `theme` with strict validation; role/status immutable by self.
- `/api/activity` allow-lists actions; IP recorded server-side from headers/socket, not client input.
- Secrets: service-role/Resend/AI keys in Vercel env only. CSP in `vercel.json`.
- Errors are generic; no SQL/stack/key leakage.
- Future: rate limiting (Vercel/Upstash), IDOR tests per resource (Phase 2+), signed storage URLs (Phase 3).
