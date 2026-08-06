-- Project Manager — a project can have several managers, not just one.
-- Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- public.project_managers becomes the source of truth for who manages a
-- project. projects.manager_id is kept and written as the *first* manager, so
-- an older deployment that still selects it keeps working during a rollout —
-- nothing reads it for permission decisions any more.
create table if not exists public.project_managers (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

-- Carry every existing single manager across.
insert into public.project_managers (project_id, user_id)
select id, manager_id from public.projects where manager_id is not null
on conflict do nothing;

alter table public.project_managers enable row level security;

-- security definer, so calling it from a policy doesn't re-enter RLS.
create or replace function public.is_project_manager(pid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_managers m
    where m.project_id = pid and m.user_id = uid
  );
$$;

-- The owning role of a project: the most privileged of its assigned managers,
-- falling back to whoever created it. app_role is declared admin < manager <
-- member, so min() picks the most privileged. Takes the creator id rather than
-- looking it up, so it stays safe to call while a project row is being
-- inserted (see schema-v8.sql for why that matters).
create or replace function public.owner_role_of_project(pid uuid, p_creator uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select min(pr.role)
      from public.project_managers m
      join public.profiles pr on pr.id = m.user_id
      where m.project_id = pid
    ),
    (select pr.role from public.profiles pr where pr.id = p_creator)
  );
$$;

create or replace function public.project_owner_role(pid uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select public.owner_role_of_project(
    pid,
    (select p.created_by from public.projects p where p.id = pid)
  );
$$;

create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_project_manager(pid, auth.uid())
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    or exists (select 1 from public.project_members pm where pm.project_id = pid and pm.user_id = auth.uid())
    or (public.is_manager() and public.project_owner_role(pid) = 'member');
$$;

create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.is_manager() and (
      public.is_project_manager(pid, auth.uid())
      or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
      or public.project_owner_role(pid) = 'member'
    ));
$$;

-- Same shape as schema-v8.sql: reads the row's own created_by and consults
-- project_managers (a different table, so it's visible mid-insert) rather than
-- looking the project up in itself.
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (
    public.is_admin()
    or created_by = auth.uid()
    or public.is_project_manager(projects.id, auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = projects.id and pm.user_id = auth.uid()
    )
    or (
      public.is_manager()
      and public.owner_role_of_project(projects.id, projects.created_by) is distinct from 'admin'
    )
  );

drop policy if exists "project_managers_select" on public.project_managers;
create policy "project_managers_select" on public.project_managers
  for select using (public.can_view_project(project_id));

drop policy if exists "project_managers_write" on public.project_managers;
create policy "project_managers_write" on public.project_managers
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
