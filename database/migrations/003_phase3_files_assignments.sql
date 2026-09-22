-- MARKLEY Phase 3 migration: class content files, assignments, submissions
-- Run in Supabase SQL editor AFTER 002_phase2_classes.sql.
-- RLS: browser gets NO direct table access; all reads/writes go through /api (service-role).
-- Storage buckets are private; browser uploads/downloads via service-signed URLs only.

-- Buckets (private) -----------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('class-files', 'class-files', false),
  ('assignment-files', 'assignment-files', false),
  ('submission-files', 'submission-files', false)
on conflict (id) do nothing;

-- Class content library -------------------------------------------------------
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 255),
  description text not null default '' check (char_length(description) <= 1000),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  storage_path text unique not null,
  visibility text not null default 'class' check (visibility in ('class','teachers')),
  created_at timestamptz not null default now()
);
create index if not exists files_class_idx on public.files(class_id);

-- Assignments ------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  type text not null default 'normal' check (type in ('guided','normal')),
  status text not null default 'published' check (status in ('draft','published')),
  due_date timestamptz,
  allow_late boolean not null default false,
  max_points integer not null default 100 check (max_points between 1 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists assignments_class_idx on public.assignments(class_id) where deleted_at is null;
drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch before update on public.assignments
for each row execute function public.touch_updated_at();

create table if not exists public.assignment_attachments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_path text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_assignment_idx on public.assignment_attachments(assignment_id);

-- Submissions -------------------------------------------------------------------
create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  text_content text not null default '' check (char_length(text_content) <= 20000),
  status text not null default 'submitted' check (status in ('submitted','late','graded')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index if not exists submissions_assignment_idx on public.assignment_submissions(assignment_id);
create index if not exists submissions_student_idx on public.assignment_submissions(student_id);
drop trigger if exists submissions_touch on public.assignment_submissions;
create trigger submissions_touch before update on public.assignment_submissions
for each row execute function public.touch_updated_at();

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_path text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists subfiles_submission_idx on public.submission_files(submission_id);

alter table public.files enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_attachments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.submission_files enable row level security;
