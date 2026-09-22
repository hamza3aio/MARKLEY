# Markley testing plan (Phase 10)

Covers spec §55. Run `npm test` (static syntax gate) first, then the flows below
against Preview with demo accounts (`admin@markley.demo`, `teacher@markley.demo`,
`assistant@markley.demo`, `student@markley.demo`, `parent@markley.demo`).
`TOKEN` = Supabase access token from sign-in. All error bodies stay generic.

## 0. Static gate
```
npm test
```

## 1. Authentication
- [ ] Sign up → verification email → `/verify.html` until confirmed.
- [ ] `/api/me` without token → 401; with unverified token → 403 `email_unverified`.
- [ ] New account is `pending` → `/api/me` 403 `account_pending`; admin activates (SQL) → 200.
- [ ] Password reset email → new password works; old session revoked.
- [ ] Sign out → session cleared; protected pages redirect to `/login.html`.
- [ ] Suspended user → 403 on every `/api` call.

## 2. Permissions (every role × protected resource)
- [ ] Student POST `/api/classes` → 403 (no `class.create`).
- [ ] Student GET another class detail → 403.
- [ ] Student GET `/api/activity` → own rows only; admin → global rows.
- [ ] Assistant outside assigned class → 403 on detail/members/invite/grade.
- [ ] Parent GET class of unlinked student → 403; linked → 200 read-only.
- [ ] Tamper test: PATCH `/api/profile` with `{"role":"admin"}` → role unchanged (allow-list).
- [ ] Direct Supabase read of another profile via anon key → denied by RLS.

## 3. Classes
- [ ] Teacher creates class → owner member row + default point rules exist.
- [ ] Invite student email → token link; wrong-email account → 403 on accept.
- [ ] Expired invite → 410 + status `expired`; revoked → 410 `revoked`.
- [ ] Reused single-use token → 410 `accepted`.
- [ ] Non-teacher invite attempt → 403. Exceeding `students_per_class.max` → 402 `plan_limit`.
- [ ] Teacher exceeding `classes.max` → 402.

## 4. Storage / files
- [ ] Upload `.exe` / `.html` → 400. Oversize → 400 with limit message.
- [ ] Confirm without uploading bytes → 400 "Upload not found".
- [ ] Student cannot list `teachers`-visibility files. Delete by non-owner → 403.
- [ ] Storage quota exceeded → 402 on next `upload-url`.
- [ ] Signed download URLs expire; no bucket is public (`storage.buckets` all `public=false`).

## 5. Assignments
- [ ] Draft invisible to students; published visible.
- [ ] Guided without text → 400; normal without file → 400.
- [ ] Late submit with `allow_late=false` past due → 409; with true → `late`.
- [ ] Resubmit replaces files (old rows gone). Other student's submission → not visible.
- [ ] Grade out of range → 400. Grading sets submission `graded`.
- [ ] Export requires `reports.export`; file opens in Excel with correct averages.

## 6. Attendance / analytics
- [ ] Future date → 400. Non-student id → 400. Non-staff POST → 403.
- [ ] Student sees own % only; parent sees linked students.
- [ ] Analytics numbers cross-checked against grades + attendance tables.

## 7. Sessions / calendar / notifications
- [ ] End ≤ start → 400; non-https meeting link → 400.
- [ ] Join redirects to provider. Members get in-app + email (if Resend set).
- [ ] Calendar shows sessions + events + due dates within range.
- [ ] Bell unread count clears on mark-all-read.
- [ ] Cron without `CRON_SECRET` → 401.

## 8. Gamification
- [ ] Submit → +10 ledger row; duplicate submit → no double award (dedupe).
- [ ] Perfect grade → +50 + ⭐ achievement + in-app notification.
- [ ] Leaderboard disabled → students get `{enabled:false}`; anonymous mode hides names but not own row.
- [ ] Rule delete with history → deactivated, not deleted. Reset clears ledger.
- [ ] Non-teacher award/reset → 403.

## 9. Exams
- [ ] Filters combine correctly; pagination `total` matches.
- [ ] Non-PDF question upload → 400. List responses contain no storage paths.
- [ ] Non-admin create/edit/delete → 403. Mark-scheme change appears in activity log.

## 10. AI (requires `AI_API_KEY`)
- [ ] Without key → 503 "not configured" (no fake output anywhere).
- [ ] Quiz draft validates (bad MCQ rejected server-side); saved quiz is `personal`.
- [ ] Student quiz never appears in another student's list.
- [ ] Assignment draft never auto-publishes; teacher publishes via normal flow.
- [ ] Suggestion approve/modify/reject recorded; rejected → grade untouched.
- [ ] Monthly quota exceeded → 402. Usage rows accumulate in `ai_requests`.

## 11. Plans
- [ ] Assign paid plan to student/parent → 400. Assign to teacher → usage reflects.
- [ ] Disabled flag (e.g. `exports=0`) blocks with 402; admin bypasses.
- [ ] Request cap: 4th open custom-plan request → 429.

## 12. Rate limits
- [ ] 11th invite-accept in a minute → 429 with `Retry-After`.

## Load / performance spot-checks
- [ ] Class with 200 members: members + analytics respond < 3s; tables paginate.
- [ ] Export with 20 assignments × 100 students produces a valid file.
