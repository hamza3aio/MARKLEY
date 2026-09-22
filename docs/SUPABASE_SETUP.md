# Supabase setup

1. Create project at supabase.com. Note URL, `anon` key, `service_role` key.
2. SQL editor — run in order:
   - `database/schema.sql`
   - `database/rls.sql`
   - `database/seed.sql` (permission matrix; demo-user UPDATEs commented)
   - `database/migrations/002_phase2_classes.sql` (Phase 2: classes, members, invitations, parent links)
   - `database/migrations/003_phase3_files_assignments.sql` (Phase 3: files, assignments, submissions + private buckets)
   - `database/migrations/004_phase4_grading_attendance.sql` (Phase 4: grades, attendance)
   - `database/migrations/005_phase5_sessions_notifications.sql` (Phase 5: sessions, events, notifications)
   - `database/migrations/006_phase6_gamification.sql` (Phase 6: point rules, ledger, achievements)
   - `database/migrations/007_phase7_exams.sql` (Phase 7: boards, subjects, exams, resources)
   - `database/migrations/008_phase8_ai_quizzes.sql` (Phase 8: quizzes, attempts, AI usage, suggestions)
   - `database/migrations/009_phase9_plans.sql` (Phase 9: plans, features, assignments, requests)
3. Authentication > Providers > Email: ON, **Confirm email: ON**.
4. Authentication > URL Configuration: Site URL = Vercel URL; Redirect URLs add `https://<app>/login.html`.
5. Auth > Users: invite `admin@markley.demo` etc., then run seed UPDATEs to set role/status.
6. Storage (Phase 3): buckets `class-files` (private), `avatars` (private). Policies land with Phase 3 migration.
7. Never put `service_role` in frontend code. Only Vercel env + `/api`.
