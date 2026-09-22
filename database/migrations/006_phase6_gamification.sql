-- MARKLEY Phase 6 migration: point rules, ledger, achievements, leaderboard privacy
-- Run in Supabase SQL editor AFTER 005_phase5_sessions_notifications.sql.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).

alter table public.classes add column if not exists leaderboard_show_names boolean not null default true;

create table if not exists public.point_rules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  points integer not null check (points between -1000 and 1000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, code)
);
create index if not exists rules_class_idx on public.point_rules(class_id) where active;

create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid references public.point_rules(id) on delete set null,
  points integer not null check (points between -1000 and 1000),
  reason text not null default '' check (char_length(reason) <= 300),
  dedupe_key text,
  awarded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists points_class_user_idx on public.points(class_id, user_id);
create unique index if not exists points_dedupe_idx on public.points(rule_id, user_id, dedupe_key) where dedupe_key is not null;

create table if not exists public.achievements (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text not null default '',
  icon text not null default '🏅' check (char_length(icon) <= 8)
);

insert into public.achievements (code, name, description, icon) values
  ('first_assignment', 'First Assignment', 'Submit your first assignment', '🎯'),
  ('perfect_score', 'Perfect Score', 'Score full marks on an assignment', '⭐'),
  ('streak_7', '7-Day Streak', 'Submit work on 7 consecutive days', '🔥'),
  ('points_100', '100 Points', 'Earn 100 points in a class', '💯'),
  ('points_500', '500 Points', 'Earn 500 points in a class', '🏆'),
  ('attendance_star', 'Perfect Attendance', 'Attend 10 sessions', '📅')
on conflict (code) do nothing;

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  achievement_code text not null references public.achievements(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists student_achievements_uniq
  on public.student_achievements(achievement_code, user_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists student_achievements_user_idx on public.student_achievements(user_id);

alter table public.point_rules enable row level security;
alter table public.points enable row level security;
alter table public.achievements enable row level security;
alter table public.student_achievements enable row level security;
