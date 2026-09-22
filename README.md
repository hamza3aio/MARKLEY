# Markley Educational Platform

Vercel-native educational platform for IGCSE students in Egypt. English only.

**Stack (per owner decision):** static frontend (HTML5/CSS3/JS) on Vercel + Node serverless `/api` + Supabase (Postgres, Auth, Storage). No PHP — PHP cannot run as a persistent server on Vercel, so the backend is serverless JS with the same REST separation the spec required. AI is deferred (abstraction lands in Phase 8).

## Phase 1 (done)
- Project structure, env handling, docs; Supabase schema + RLS + seed
- Email/password auth with verification gate, password reset, sessions
- 5 role dashboards, granular permissions, activity log, theme personalization

## Phase 2 (done)
- Classes CRUD, members, invitation-only join, parent links

## Phase 3 (done)
- Storage buckets, content library, assignments, submissions, PDF scanner

## Phase 4 scope (this commit)
- Manual grading (score 0–max, feedback, submission marked graded)
- Attendance marking (per-day grid, no future dates, student/parent read views)
- Analytics (per-student aggregates, per-assignment averages, Chart.js chart + tables)
- Excel export (grades / attendance / full report .xlsx, generated server-side)

Phases 3–10 follow `docs/ROADMAP.md`.

## Requirements
- Node 18+, Vercel CLI (`npm i -g vercel`), Supabase project, GitHub repo connected

## Local development
1. `cp .env.example .env.local` — fill `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. In Supabase SQL editor run in order: `database/schema.sql`, `database/rls.sql`, `database/seed.sql`
3. Supabase Auth: enable Email provider + **Confirm email** ON
4. `npm install` then `vercel dev` (serves `/public` + `/api` with env from `.env.local`)
5. Create demo users via Supabase Auth, then activate per `database/seed.sql` comments

## Environment variables (Vercel > Settings > Environment Variables)
- `SUPABASE_URL` (all environments)
- `SUPABASE_ANON_KEY` (exposed via `/api/config` only — safe, public key with RLS)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to browser)
- `APP_URL` (production URL)
- Later: `RESEND_API_KEY`, `AI_API_KEY`, `AI_PROVIDER`

## Deploy
See `docs/VERCEL_DEPLOY.md` (GitHub → Vercel, env, domain, Supabase wiring). Backend and frontend deploy together — `/api` is the backend.

## Security notes
- Service-role key only in serverless env. CSP headers in `vercel.json`.
- RLS denies all browser writes; mutations go through `/api` with JWT verification + `role_permissions` checks.
- Generic error messages to clients; details stay server-side. See `docs/SECURITY.md`.
