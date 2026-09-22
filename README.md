# Markley Educational Platform

Vercel-native educational platform for IGCSE students in Egypt. English only.

**Stack (per owner decision):** static frontend (HTML5/CSS3/JS) on Vercel + Node serverless `/api` + Supabase (Postgres, Auth, Storage). No PHP — PHP cannot run as a persistent server on Vercel, so the backend is serverless JS with the same REST separation the spec required. The API ships as **one catch-all function** (`api/[...route].js` → `server/`) to stay within the Vercel Hobby 12-function cap.

## Phase 1 (done)
- Project structure, env handling, docs; Supabase schema + RLS + seed
- Email/password auth with verification gate, password reset, sessions
- 5 role dashboards, granular permissions, activity log, theme personalization

## Phase 2 (done)
- Classes CRUD, members, invitation-only join, parent links

## Phase 3 (done)
- Storage buckets, content library, assignments, submissions, PDF scanner

## Phase 4 (done)
- Manual grading, attendance, analytics, xlsx export

## Phase 5 (done)
- Live sessions, calendar, events, notifications bell, Resend EmailService

## Phase 6 (done)
- Per-class point rules, auto-awards, leaderboards, achievements

## Phase 7 (done)
- Public exam library, mark schemes, resources

## Phase 8 (done)
- AIService, quiz/assignment generation, practice quizzes, assisted grading

## Phase 9 (done)
- Plans, limits, custom requests, server-side gates

## Phase 10 scope (this commit)
- Security audit (`docs/AUDIT.md`), upload-existence checks, rate limits, hardened headers
- Full test plan (`docs/TESTING.md`), `npm test` static gate
- Final deployment + production docs

All 10 phases complete. See `docs/ROADMAP.md` for the full history.

## Requirements
- Node 18+, Vercel CLI (`npm i -g vercel`), Supabase project, GitHub repo connected

## Local development
1. `cp .env.example .env.local` — fill at minimum `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. In Supabase SQL editor run in order: `database/schema.sql`, `database/rls.sql`, `database/seed.sql`, then `database/migrations/002` through `010` in numeric order
3. Supabase Auth: enable Email provider + **Confirm email** ON
4. `npm install` then `npm test` (static gate), then `vercel dev` (serves `/public` + `/api` with env from `.env.local`)
5. Create demo users via Supabase Auth, then activate per `database/seed.sql` comments
6. Work through `docs/TESTING.md` before promoting Preview to Production

## Environment variables (Vercel > Settings > Environment Variables)
- `SUPABASE_URL` (all environments)
- `SUPABASE_ANON_KEY` (exposed via `/api/config` only — safe, public key with RLS)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to browser)
- `APP_URL` (production URL)
- `RESEND_API_KEY` + `RESEND_FROM` (server-only; emails skipped if unset)
- `CRON_SECRET` (authorizes `/api/cron/session-reminders`)
- `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` (server-only; AI returns 503 without key)
- Billing later: no code changes needed — add provider keys and price logic on top of `plans` (see `docs/ARCHITECTURE.md`)

## Deploy
See `docs/VERCEL_DEPLOY.md` (GitHub → Vercel, env, domain, Supabase wiring). Backend and frontend deploy together — `/api` is the backend.

## Security notes
- Service-role key only in serverless env. CSP + HSTS + Permissions-Policy in `vercel.json`.
- RLS denies all browser writes; mutations go through `/api` with JWT verification + `role_permissions` checks.
- Generic error messages to clients; details stay server-side. See `docs/SECURITY.md`, `docs/AUDIT.md`, `docs/TESTING.md`.
