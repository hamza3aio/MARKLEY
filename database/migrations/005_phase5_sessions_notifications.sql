-- MARKLEY Phase 5 migration: sessions, calendar events, notifications
-- Run in Supabase SQL editor AFTER 004_phase4_grading_attendance.sql.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  start_at timestamptz not null,
  end_at timestamptz not null,
  meeting_url text not null default '' check (char_length(meeting_url) <= 2000),
  provider text not null default 'other' check (provider in ('zoom','teams','meet','other')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_at > start_at)
);
create index if not exists sessions_class_start_idx on public.sessions(class_id, start_at) where deleted_at is null;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  type text not null default 'event' check (type in ('event','exam','deadline','session')),
  start_at timestamptz not null,
  end_at timestamptz,
  link text not null default '' check (char_length(link) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_class_start_idx on public.calendar_events(class_id, start_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  link text not null default '' check (char_length(link) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id, created_at desc) where read_at is null;

alter table public.profiles add column if not exists email_notifications boolean not null default true;

alter table public.sessions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notifications enable row level security;
