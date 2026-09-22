-- MARKLEY Phase 4 migration: grades, attendance
-- Run in Supabase SQL editor AFTER 003_phase3_files_assignments.sql.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).
-- grading_source anticipates Phase 8 AI (manual only for now).

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score numeric not null check (score >= 0),
  max_points integer not null check (max_points between 1 and 1000),
  feedback text not null default '' check (char_length(feedback) <= 2000),
  graded_by uuid references public.profiles(id) on delete set null,
  grading_source text not null default 'manual' check (grading_source in ('manual','ai_approved','ai_modified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index if not exists grades_assignment_idx on public.grades(assignment_id);
create index if not exists grades_student_idx on public.grades(student_id);
drop trigger if exists grades_touch on public.grades;
create trigger grades_touch before update on public.grades
for each row execute function public.touch_updated_at();

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  date date not null check (date <= current_date),
  status text not null check (status in ('present','absent','late','excused')),
  marked_by uuid references public.profiles(id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (class_id, date, student_id)
);
create index if not exists attendance_class_date_idx on public.attendance(class_id, date desc);
create index if not exists attendance_student_idx on public.attendance(student_id);

alter table public.grades enable row level security;
alter table public.attendance enable row level security;
