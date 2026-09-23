# Markley Educational Platform (Next.js)

Vercel-native educational platform for IGCSE students in Egypt. English only.

**Stack:** Next.js 16 (App Router + TypeScript) on Vercel + Supabase (Postgres, Auth, Storage). Server Actions + one export route + one cron route — well within Hobby limits. Same database as before; no migration needed beyond `database/migrations/010_phase10_hardening.sql`.

## Features (all working, all browser-tested)
- Auth with email verification + active-account gate, 5 role dashboards
- Classes, invitation-only join (single-use/expiry), parent links
- Content library, assignments (guided/normal), submissions, mobile PDF scanner
- Manual grading + gradebook, attendance, analytics, `.xlsx` export
- Live sessions, calendar, events, notifications bell, session-reminder cron
- Points, leaderboards, achievements, exams library with mark schemes
- AI quizzes/drafts/assisted grading (needs `AI_API_KEY`, degrades gracefully)
- Plans, limits, custom-plan requests (students/parents never charged)

## Local development
1. `cp .env.example .env.local` and fill the keys
2. Database already live; for fresh rebuilds run `database/schema.sql`, `rls.sql`, `seed.sql`, then `database/migrations/002`–`010` in order
3. `npm install`, `npm run dev`
4. `npm run build` must pass before pushing

## Environment variables (Vercel → Settings → Environment Variables)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, bundled)
- `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `CRON_SECRET` (server-only)
- Optional: `RESEND_API_KEY`, `RESEND_FROM`, `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`

## Deploy
Vercel → Import `hamza3aio/MARKLEY`. Framework **Next.js** (auto), Root `./`, defaults for build/output. Add env vars, deploy. Set Supabase Auth URL config (Site URL + `/login` redirect) to the Vercel domain.

## Docs
`docs/` keeps the Supabase setup, testing matrix, security model and audit — still accurate. `database/` holds the full schema history.
