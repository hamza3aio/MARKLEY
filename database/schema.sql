-- MARKLEY Educational Platform — Phase 1 schema
-- Target: Supabase Postgres. Run in Supabase SQL editor.
-- Phase 2+ tables (classes, assignments, etc.) ship as separate migrations.

-- 1. Roles ---------------------------------------------------------------
create table if not exists public.roles (
  name text primary key check (name in ('admin','teacher','assistant','student','parent')),
  description text not null default '',
  created_at timestamptz not null default now()
);

insert into public.roles (name, description) values
  ('admin','Full platform administration'),
  ('teacher','Own classes, content, grading, analytics'),
  ('assistant','Assigned classes only, delegated permissions'),
  ('student','Joined classes via invitation only'),
  ('parent','Read-only linked student progress')
on conflict (name) do nothing;

-- 2. Permissions ----------------------------------------------------------
create table if not exists public.permissions (
  key text primary key,
  category text not null default 'general',
  description text not null default ''
);

-- Granular catalogue (spec section 5). Keys are stable; gate server-side.
insert into public.permissions (key, category, description) values
  ('users.manage','users','Create/edit/suspend/activate users'),
  ('roles.manage','users','Change roles and permissions'),
  ('class.create','classes','Create classes'),
  ('class.edit','classes','Edit own classes'),
  ('class.delete','classes','Delete own classes'),
  ('class.invite','classes','Invite students/assistants'),
  ('assignment.create','assignments','Create assignments'),
  ('assignment.grade','assignments','Grade submissions'),
  ('content.upload','content','Upload class content'),
  ('analytics.view','analytics','View class analytics'),
  ('reports.export','reports','Export xlsx reports'),
  ('exams.manage','exams','Manage public exams'),
  ('markschemes.manage','exams','Manage mark schemes'),
  ('leaderboard.manage','gamification','Enable/disable leaderboard'),
  ('plans.manage','plans','Manage plans and limits'),
  ('activity.view_global','activity','View global activity log')
on conflict (key) do nothing;

create table if not exists public.role_permissions (
  role text not null references public.roles(name) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);

-- 3. Profiles (extends auth.users) ----------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null default '',
  role text not null default 'student' references public.roles(name),
  status text not null default 'pending' check (status in ('pending','active','suspended','deleted')),
  theme jsonb not null default '{"primary":"#2563eb","secondary":"#0ea5e9","mode":"light"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_email_idx on public.profiles(email);

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- Auto-create pending student profile on signup (security definer so RLS-safe)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), 'student', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 4. Activity logs ----------------------------------------------------------
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists activity_actor_idx on public.activity_logs(actor_id);
create index if not exists activity_action_idx on public.activity_logs(action);
create index if not exists activity_created_idx on public.activity_logs(created_at desc);
