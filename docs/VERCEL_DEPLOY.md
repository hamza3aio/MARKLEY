# Vercel deployment (production)

1. Push to GitHub (`hamza3aio/MARKLEY`, branch `main`).
2. Vercel > Add New Project > Import `MARKLEY`. Framework: **Other**. Root: `./`. Output: `public`.
   - No build command needed (static). Install command: `npm install` (for `/api` deps: supabase, exceljs, resend).
3. Environment Variables (Production + Preview + Development):
   - Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`
   - Email: `RESEND_API_KEY`, `RESEND_FROM` (optional; emails skipped if unset)
   - Cron: `CRON_SECRET` (long random string; authorizes `/api/cron/session-reminders`)
   - AI: `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` (optional; AI returns 503 without key)
4. Deploy. The daily session-reminder cron (`vercel.json`) registers automatically.
5. Custom domain: Vercel > Domains > Add; update Supabase Site URL + `APP_URL` + Resend domain.

## Go-live verification (do all of these on Preview first)
- [ ] `GET /api/config` returns URL + anon key only (never the service key).
- [ ] Security headers present: CSP, HSTS, X-Frame-Options.
- [ ] Sign up → verify → pending → admin activates → dashboard loads.
- [ ] RLS probe: anon-key read of another profile → denied.
- [ ] Upload probe: `.exe` rejected; confirm-without-upload rejected.
- [ ] Cron probe: `GET /api/cron/session-reminders` without secret → 401.
- [ ] Run the full matrix in `docs/TESTING.md` with the five demo roles.
- [ ] Promote to Production only after the matrix passes.

## Rollback
- Vercel > Deployments > previous production > Promote. Database migrations are
  additive (no destructive alters), so rollback is frontend/API only.
