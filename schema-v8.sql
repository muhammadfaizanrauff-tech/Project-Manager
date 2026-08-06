-- Project Manager — fix: non-admins couldn't create projects.
-- Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- The bug: projects_select called can_view_project(id), which looks the row up
-- *in public.projects*. During `insert ... returning` (what the app does to get
-- the new project's id) that self-lookup runs under the statement's snapshot,
-- taken before the row existed — so every check inside returned false and
-- Postgres rejected the row with 42501. Admins never noticed because
-- is_admin() short-circuits before any lookup happens.
--
-- The fix: projects_select now reads the row's own columns (created_by,
-- manager_id) instead of re-querying the table, so there's nothing to be
-- invisible. can_view_project stays as-is for every *other* table's policies,
-- where it inspects an already-committed project row and works correctly.

-- Resolves a project's owning role from ids passed in, rather than from a
-- project id — no lookup in public.projects, so it's snapshot-safe. Security
-- definer keeps it out of profiles' own RLS.
create or replace function public.owner_role_of(p_manager uuid, p_creator uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pr.role from public.profiles pr where pr.id = p_manager),
    (select pr.role from public.profiles pr where pr.id = p_creator)
  );
$$;

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (
    public.is_admin()
    or created_by = auth.uid()
    or manager_id = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = projects.id and pm.user_id = auth.uid()
    )
    -- Managers see everything that isn't the Admin's own: member-owned
    -- projects in full, other managers' read-only (writes stay blocked by the
    -- update/delete policies, which are unchanged).
    or (
      public.is_manager()
      and public.owner_role_of(projects.manager_id, projects.created_by) is distinct from 'admin'
    )
  );
