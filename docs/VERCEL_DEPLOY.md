# Vercel deployment

1. Push to GitHub (`hamza3aio/MARKLEY`, branch `main`).
2. Vercel > Add New Project > Import `MARKLEY`. Framework: **Other**. Root: `./`. Output: `public`.
   - No build command needed (static). Install command: `npm install` (for `/api` deps).
3. Environment Variables (Production + Preview):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`
4. Deploy. Test: `/api/config` returns URL+anon only (never service key).
5. Custom domain: Vercel > Domains > Add; update Supabase Site URL + `APP_URL`.
6. Supabase wiring: confirm RLS (try reading another user's profile → denied), verify email gate (`/api/me` returns `email_unverified` until confirmed).
