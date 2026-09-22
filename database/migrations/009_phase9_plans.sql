-- MARKLEY Phase 9 migration: plans, features, user plans, custom requests
-- Run in Supabase SQL editor AFTER 008_phase8_ai_quizzes.sql.
-- Students/parents NEVER pay: assignment API rejects paid plans for those roles.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text unique not null check (slug ~ '^[a-z0-9_]{2,40}$'),
  description text not null default '' check (char_length(description) <= 1000),
  price_monthly numeric check (price_monthly is null or price_monthly >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
for each row execute function public.touch_updated_at();

-- Feature catalogue (limits are integers; flags are 0/1).
-- limits: classes.max, students_per_class.max, storage_mb.max, ai_monthly.max
-- flags: ai_tools, exports, analytics, leaderboard, sessions
create table if not exists public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  value integer not null,
  primary key (plan_id, feature_key)
);

insert into public.plans (name, slug, description, price_monthly, is_active, is_default)
values ('Free', 'free', 'Default plan for teachers and schools getting started.', 0, true, true)
on conflict (slug) do nothing;

insert into public.plan_features (plan_id, feature_key, value)
select id, f.key, f.val from public.plans,
  (values ('classes.max', 5), ('students_per_class.max', 50), ('storage_mb.max', 1024),
          ('ai_monthly.max', 50), ('ai_tools', 1), ('exports', 1), ('analytics', 1),
          ('leaderboard', 1), ('sessions', 1)) as f(key, val)
where slug = 'free'
on conflict (plan_id, feature_key) do nothing;

create table if not exists public.user_plans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists userplans_touch on public.user_plans;
create trigger userplans_touch before update on public.user_plans
for each row execute function public.touch_updated_at();

create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null,
  organization text not null default '' check (char_length(organization) <= 200),
  message text not null check (char_length(message) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending','contacted','closed')),
  created_at timestamptz not null default now()
);
create index if not exists planreq_status_idx on public.plan_requests(status, created_at desc);

alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.user_plans enable row level security;
alter table public.plan_requests enable row level security;
