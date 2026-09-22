-- MARKLEY Phase 7 migration: exam boards, subjects, public exams, mark schemes
-- Run in Supabase SQL editor AFTER 006_phase6_gamification.sql.
-- RLS: browser gets NO direct access; reads go through /api (service-role).
-- Any active user may read; writes require the exams.manage permission (admin).

insert into storage.buckets (id, name, public) values
  ('exam-files', 'exam-files', false)
on conflict (id) do nothing;

create table if not exists public.exam_boards (
  code text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 80)
);

insert into public.exam_boards (code, name) values
  ('cambridge', 'Cambridge International'),
  ('edexcel', 'Pearson Edexcel'),
  ('ocr', 'OCR'),
  ('aqa', 'AQA')
on conflict (code) do nothing;

create table if not exists public.subjects (
  code text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 80)
);

insert into public.subjects (code, name) values
  ('physics', 'Physics'), ('chemistry', 'Chemistry'), ('biology', 'Biology'),
  ('mathematics', 'Mathematics'), ('further_maths', 'Further Mathematics'),
  ('english_first', 'English - First Language'), ('english_second', 'English - Second Language'),
  ('english_literature', 'English Literature'), ('computer_science', 'Computer Science'),
  ('ict', 'ICT'), ('business', 'Business Studies'), ('economics', 'Economics'),
  ('accounting', 'Accounting'), ('history', 'History'), ('geography', 'Geography'),
  ('arabic_first', 'Arabic - First Language'), ('french', 'French'), ('german', 'German')
on conflict (code) do nothing;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null references public.subjects(code),
  board_code text not null references public.exam_boards(code),
  year integer not null check (year between 1990 and 2100),
  session text not null check (session in ('Feb/March', 'May/June', 'Oct/Nov')),
  paper text not null check (char_length(paper) between 1 and 60),
  title text not null default '' check (char_length(title) <= 200),
  question_path text,
  question_name text not null default '',
  markscheme_path text,
  markscheme_name text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exams_filter_idx on public.exams(subject_code, board_code, year, session);
create index if not exists exams_title_idx on public.exams using gin (to_tsvector('english', title || ' ' || paper));
drop trigger if exists exams_touch on public.exams;
create trigger exams_touch before update on public.exams
for each row execute function public.touch_updated_at();

create table if not exists public.exam_resources (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  name text not null check (char_length(name) between 1 and 255),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_path text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists examres_exam_idx on public.exam_resources(exam_id);

alter table public.exam_boards enable row level security;
alter table public.subjects enable row level security;
alter table public.exams enable row level security;
alter table public.exam_resources enable row level security;
