-- Project Manager — members add and edit freely; only Admins and Managers
-- delete. Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- schema-v5.sql let whoever created a project manage it, which also handed
-- members the ability to delete. Split those apart:
--   can_manage_project  → "may DELETE things here"  (Admins + Managers only)
--   can_edit_project    → "may CHANGE things here"  (+ the project's creator)
-- Members still route task deletions through delete_requests (schema-v3.sql).

create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.is_manager() and (
      exists (
        select 1 from public.projects p
        where p.id = pid and (p.manager_id = auth.uid() or p.created_by = auth.uid())
      )
      or public.project_owner_role(pid) = 'member'
    ));
$$;

create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_project(pid)
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid());
$$;

-- Categories: anyone who can work in the project may add and rename them.
-- (categories_insert already allows this; categories_delete stays
-- Admin/Manager-only via can_manage_project.)
drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories
  for update using (public.can_access_project(project_id));

-- The project itself: its creator can rename/reschedule it, but projects_delete
-- stays on can_manage_project so they can't delete it.
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update using (public.can_edit_project(id));

-- Unchanged on purpose, so members can add and edit but never delete:
--   tasks_insert / tasks_update      → can_access_project  (add + edit)
--   tasks_delete                     → can_manage_project  (delete requests instead)
--   categories_delete                → can_manage_project
--   projects_delete                  → can_manage_project
--   project_members_insert/delete    → can_manage_project  (staffing is a
--                                      manager job; the UI never offers it
--                                      to members)
