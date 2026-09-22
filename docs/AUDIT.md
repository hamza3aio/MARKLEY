# Phase 10 security audit — findings and resolutions

Audited every `/api` route + RLS + frontend handling. Test with `docs/TESTING.md`.

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | File confirm endpoints trusted client paths without checking bytes existed → dangling rows, broken links | Medium | `objectExists()` check in all 5 confirm paths (content, assignment/modal attachments, submissions, exam resources, exam papers) |
| 2 | No rate limiting on invitation accept, AI, uploads, sales requests | Medium | Per-IP limits in `api/_lib/rate.js` (documented per-instance limitation) |
| 3 | Missing HSTS / Permissions-Policy headers | Low | Added in `vercel.json` (camera allowed for scanner) |
| 4 | Quiz takers could see MCQ answers if API leaked them | Medium | Answers stripped server-side for takers; verified in `quizzes/[id].js` |
| 5 | Storage paths in exam listings could aid enumeration | Low | Paths stripped from list responses; signed URLs only in detail |
| 6 | Plan restrictions only partially enforced | Medium | Gates added: classes, class size, storage quota, AI quota, exports/analytics/leaderboard/sessions flags |
| 7 | Students/parents could theoretically be assigned paid plans | Medium | API rejects paid-plan assignment to those roles; UI never offers it |
| 8 | CSRF | Info | Not applicable: Bearer-token API, no cookies. Documented |
| 9 | Login brute force | Info | Owned by Supabase Auth (rate-limited, email throttling); our sensitive routes additionally limited |
| 10 | SQL injection / XSS | Info | supabase-js parameterization throughout; `esc()` on all interpolated strings; CSP enforced |

## Standing limitations (documented, not hidden)
- Rate limiter is per serverless instance (Vercel). For strict global limits add Upstash Redis.
- AI reads answer text + file names, not file bytes (documented in UI/API).
- Signed-URL pattern assumes Supabase honors service-signed URLs with locked-down buckets (standard pattern; verified at deploy per `docs/VERCEL_DEPLOY.md`).
- `service_role` bypasses RLS by design — it lives only in server env, never in responses.
