-- Project Manager — schema additions for cross-manager read-only visibility and
-- an impersonation audit trail. Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- ── Managers can view (read-only) other managers' projects/tasks/comments ──
-- The Admin's own personally-managed projects stay invisible to managers —
-- this is keyed off the *project's assigned manager's role*, not a separate
-- "private" flag, so nothing needs backfilling on existing rows.
create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_access_project(pid)
    or (
      public.is_manager()
      and exists (
        select 1 from public.projects p
        join public.profiles mgr on mgr.id = p.manager_id
        where p.id = pid and mgr.role = 'manager'
      )
    );
$$;

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (public.can_view_project(id));

drop policy if exists "project_members_select" on public.project_members;
create policy "project_members_select" on public.project_members
  for select using (public.can_view_project(project_id));

drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select using (public.can_view_project(project_id));

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (public.can_view_project(project_id));

drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_view_project(t.project_id))
  );

-- The one write action a cross-viewing manager gets: feedback comments.
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_view_project(t.project_id))
  );

-- Every other write policy (projects/tasks/categories/project_members
-- insert/update/delete) is intentionally left on can_access_project /
-- can_manage_project — unchanged — so this really is read-only.

-- ── Impersonation audit trail ───────────────────────────────────────────
-- "Switch to" (src/app/(app)/impersonate-actions.ts) logs into here so
-- there's a record of who acted as whom and when, given how much trust
-- full act-as impersonation carries. Admin-only visibility; no UI reads
-- this yet, it's just captured in case it's ever needed.
create table if not exists public.impersonation_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  target_id   uuid references public.profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

alter table public.impersonation_log enable row level security;

drop policy if exists "impersonation_log_select_admin" on public.impersonation_log;
create policy "impersonation_log_select_admin" on public.impersonation_log
  for select using (public.is_admin());

-- Written exclusively via the service-role client from impersonate-actions.ts
-- (which bypasses RLS after verifying the caller's role itself, same pattern
-- as every other service-role write in this codebase) — no insert/update
-- policy needed for anon/authenticated roles.
