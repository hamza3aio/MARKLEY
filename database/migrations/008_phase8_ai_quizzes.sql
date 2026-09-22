-- MARKLEY Phase 8 migration: quizzes, attempts, AI usage + grading suggestions
-- Run in Supabase SQL editor AFTER 007_phase7_exams.sql.
-- RLS: browser gets NO direct access; all reads/writes go through /api (service-role).
-- Student personal quizzes (class_id NULL) are visible only to their creator unless shared.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  topic text not null default '' check (char_length(topic) <= 300),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  source text not null default 'manual' check (source in ('manual','ai')),
  status text not null default 'draft' check (status in ('draft','published','personal','shared')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists quizzes_class_idx on public.quizzes(class_id) where deleted_at is null;
create index if not exists quizzes_creator_idx on public.quizzes(created_by) where class_id is null;

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  kind text not null check (kind in ('mcq','short','essay')),
  prompt text not null check (char_length(prompt) between 1 and 3000),
  options jsonb not null default '[]'::jsonb,
  answer text not null default '',
  points integer not null default 10 check (points between 1 and 100),
  position integer not null default 0
);
create index if not exists qq_quiz_idx on public.quiz_questions(quiz_id);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score numeric,
  max_points integer,
  status text not null default 'submitted' check (status in ('submitted','graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz not null default now()
);
create index if not exists qa_quiz_idx on public.quiz_attempts(quiz_id);
create index if not exists qa_student_idx on public.quiz_attempts(student_id);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_text text not null default '' check (char_length(answer_text) <= 5000),
  is_correct boolean,
  unique (attempt_id, question_id)
);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('quiz','assignment','grade','feedback')),
  provider text not null default '',
  model text not null default '',
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists aireq_user_idx on public.ai_requests(user_id, created_at desc);

create table if not exists public.ai_grading_suggestions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid references public.assignment_submissions(id) on delete set null,
  suggested_score numeric not null,
  suggested_feedback text not null default '',
  criteria text not null default '',
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','approved','modified','rejected')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists aisug_assignment_idx on public.ai_grading_suggestions(assignment_id) where status = 'pending';

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_grading_suggestions enable row level security;
