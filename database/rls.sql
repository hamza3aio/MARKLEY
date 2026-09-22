-- MARKLEY — Row Level Security (run after schema.sql)
-- Principle: never trust frontend role. /api uses SERVICE_ROLE and re-checks
-- role_permissions server-side. Direct browser access is minimal.

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- Roles / permissions catalogues are readable by any authenticated user
-- (needed for UI gating; real enforcement is server-side).
drop policy if exists "roles readable" on public.roles;
create policy "roles readable" on public.roles for select to authenticated using (true);
drop policy if exists "permissions readable" on public.permissions;
create policy "permissions readable" on public.permissions for select to authenticated using (true);
drop policy if exists "role_permissions readable" on public.role_permissions;
create policy "role_permissions readable" on public.role_permissions for select to authenticated using (true);

-- Profiles: user reads own row only (initplan-safe: auth.uid() evaluated once).
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

-- No direct update/insert/delete from browser. All writes go through /api
-- (service-role + permission checks) so role/status can never be self-escalated.
drop policy if exists "profiles update own safe fields" on public.profiles;

-- Activity logs: user reads own entries only. Writes via /api (service-role).
drop policy if exists "activity select own" on public.activity_logs;
create policy "activity select own" on public.activity_logs
for select to authenticated using ((select auth.uid()) = actor_id);
