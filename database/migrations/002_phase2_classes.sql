-- MARKLEY Phase 2 migration: classes, members, invitations, parent links
-- Run in Supabase SQL editor AFTER Phase 1 files.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).

create extension if not exists "pgcrypto";

-- Classes -----------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 120),
  subject text not null check (char_length(subject) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  teacher_id uuid references public.profiles(id) on delete set null,
  leaderboard_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists classes_teacher_idx on public.classes(teacher_id) where deleted_at is null;
create index if not exists classes_subject_idx on public.classes(subject) where deleted_at is null;
drop trigger if exists classes_touch on public.classes;
create trigger classes_touch before update on public.classes
for each row execute function public.touch_updated_at();

-- Members ------------------------------------------------------------------
create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_in_class text not null check (role_in_class in ('teacher','assistant','student')),
  status text not null default 'active' check (status in ('active','removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (class_id, user_id)
);
create index if not exists members_class_idx on public.class_members(class_id) where status = 'active';
create index if not exists members_user_idx on public.class_members(user_id) where status = 'active';

-- Invitations (invitation-only access; single-use + expiry + revocation) ----
create table if not exists public.class_invitations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  email text not null,
  role_in_class text not null check (role_in_class in ('assistant','student')),
  token text unique not null,
  single_use boolean not null default true,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists invites_class_idx on public.class_invitations(class_id);
create index if not exists invites_email_idx on public.class_invitations(lower(email)) where status = 'pending';
create index if not exists invites_token_idx on public.class_invitations(token);

-- Parent links ---------------------------------------------------------------
create table if not exists public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique (parent_id, student_id),
  check (parent_id <> student_id)
);
create index if not exists links_parent_idx on public.parent_student_links(parent_id) where status = 'active';
create index if not exists links_student_idx on public.parent_student_links(student_id) where status = 'active';

-- Lock down browser access: no policies = denied for anon/authenticated.
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_invitations enable row level security;
alter table public.parent_student_links enable row level security;
