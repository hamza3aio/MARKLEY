# Roadmap (spec build order, PHP removed, AI deferred)

- [x] Phase 1: structure, DB, auth, roles, basic dashboards (done)
- [x] Phase 2: classes, invitations (single-use/expiry/revoke), members, parent links (done)
- [x] Phase 3: Storage, assignments, submissions, PDF scanner (done)
- [x] Phase 4: grading, attendance, analytics, xlsx export (done)
- [x] Phase 5: calendar, sessions, notifications, Resend (done)
- [x] Phase 6: points, leaderboards, achievements (done)
- [x] Phase 7: exams + mark schemes (done)
- [x] Phase 8: AI quiz/assignment/grading (done)
- [x] Phase 9: plans + limits (done)
- [x] Phase 10: audit, testing, deployment (this commit)
- [ ] Phase 3: Supabase Storage, assignments (guided/normal), submissions, mobile PDF scanner
- [ ] Phase 4: manual grading, analytics, attendance, xlsx export (SheetJS server-side)
- [ ] Phase 5: calendar, sessions (external links), Resend EmailService abstraction
- [ ] Phase 6: point rules (per-class), leaderboards (opt-in), achievements
- [ ] Phase 7: public exams + mark schemes with filters
- [ ] Phase 8 (deferred per owner): AIService abstraction + quiz/assignment/grading suggestions, teacher approve/modify/reject, usage tracking
- [ ] Phase 9: plans, feature flags, limits, custom-plan requests
- [ ] Phase 10: audit, perf (pagination/indexes/lazy), testing docs, prod hardening
