-- MARKLEY — Phase 1 seed (development only, no real PII)
-- Run after schema.sql + rls.sql.

-- Default permission matrix
insert into public.role_permissions (role, permission)
select 'admin', key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role, permission) values
  ('teacher','class.create'),('teacher','class.edit'),('teacher','class.delete'),
  ('teacher','class.invite'),('teacher','assignment.create'),('teacher','assignment.grade'),
  ('teacher','content.upload'),('teacher','analytics.view'),('teacher','reports.export'),
  ('teacher','leaderboard.manage'),
  ('assistant','assignment.grade'),('assistant','content.upload'),('assistant','class.invite'),
  ('student','content.upload'),
  ('parent','analytics.view')
on conflict do nothing;

-- Demo accounts: create these users in Supabase Auth first
-- (Authentication > Users > Invite, with email verification ON),
-- then run the updates below. Passwords are never seeded here.
--
-- Demo emails (clearly fake):
--   admin@markley.demo / teacher@markley.demo / assistant@markley.demo
--   student@markley.demo / parent@markley.demo
--
-- update public.profiles set role='admin', status='active', full_name='Demo Admin' where email='admin@markley.demo';
-- update public.profiles set role='teacher', status='active', full_name='Demo Teacher' where email='teacher@markley.demo';
-- update public.profiles set role='assistant', status='active', full_name='Demo Assistant' where email='assistant@markley.demo';
-- update public.profiles set role='student', status='active', full_name='Demo Student' where email='student@markley.demo';
-- update public.profiles set role='parent', status='active', full_name='Demo Parent' where email='parent@markley.demo';
