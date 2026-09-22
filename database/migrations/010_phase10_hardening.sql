-- MARKLEY Phase 10 hardening (already applied to production via migration tool).
-- Run in Supabase SQL editor only for fresh rebuilds AFTER 009_phase9_plans.sql.

-- Revoke direct RPC execution of the signup trigger function
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Immutable search_path on trigger helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- RLS initplan: evaluate auth.uid() once per query, not per row
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "activity select own" on public.activity_logs;
create policy "activity select own" on public.activity_logs
for select to authenticated using ((select auth.uid()) = actor_id);

-- Covering indexes for foreign keys flagged by the database linter
create index if not exists aisug_resolved_idx on public.ai_grading_suggestions(resolved_by);
create index if not exists aisug_student_idx on public.ai_grading_suggestions(student_id);
create index if not exists aisug_submission_idx on public.ai_grading_suggestions(submission_id);
create index if not exists assignments_creator_idx on public.assignments(created_by);
create index if not exists attendance_marker_idx on public.attendance(marked_by);
create index if not exists events_creator_idx on public.calendar_events(created_by);
create index if not exists invites_accepted_idx on public.class_invitations(accepted_by);
create index if not exists invites_inviter_idx on public.class_invitations(invited_by);
create index if not exists members_inviter_idx on public.class_members(invited_by);
create index if not exists classes_creator_idx on public.classes(created_by);
create index if not exists exams_board_idx on public.exams(board_code);
create index if not exists exams_creator_idx on public.exams(created_by);
create index if not exists files_uploader_idx on public.files(uploaded_by);
create index if not exists grades_grader_idx on public.grades(graded_by);
create index if not exists links_creator_idx on public.parent_student_links(created_by);
create index if not exists planreq_creator_idx on public.plan_requests(created_by);
create index if not exists rules_creator_idx on public.point_rules(created_by);
create index if not exists points_awarder_idx on public.points(awarded_by);
create index if not exists points_user_idx on public.points(user_id);
create index if not exists qanswers_question_idx on public.quiz_answers(question_id);
create index if not exists roleperm_perm_idx on public.role_permissions(permission);
create index if not exists sessions_creator_idx on public.sessions(created_by);
create index if not exists sach_class_idx on public.student_achievements(class_id);
create index if not exists userplans_assigner_idx on public.user_plans(assigned_by);
create index if not exists userplans_plan_idx on public.user_plans(plan_id);
