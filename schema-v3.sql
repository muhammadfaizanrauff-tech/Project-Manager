-- Project Manager — schema addition for delete requests. Members can't
-- delete tasks directly; instead they submit a request that an Admin
-- reviews and approves/rejects from Settings → Delete Requests.
-- Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.delete_requests (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references public.tasks(id) on delete set null,
  project_id   uuid not null references public.projects(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  task_name    text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

alter table public.delete_requests enable row level security;

drop policy if exists "delete_requests_select" on public.delete_requests;
create policy "delete_requests_select" on public.delete_requests
  for select using (public.is_admin() or requested_by = auth.uid());

drop policy if exists "delete_requests_insert" on public.delete_requests;
create policy "delete_requests_insert" on public.delete_requests
  for insert with check (public.can_access_project(project_id));

drop policy if exists "delete_requests_update" on public.delete_requests;
create policy "delete_requests_update" on public.delete_requests
  for update using (public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.delete_requests;
exception when duplicate_object then null; end $$;
