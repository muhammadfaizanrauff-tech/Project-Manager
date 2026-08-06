-- ═══════════════════════════════════════════════════════════════════════
-- Project Manager — CATCH-UP MIGRATION
--
-- schema-v3.sql through schema-v9.sql concatenated. Every part is idempotent,
-- so running the whole file is safe even if some of it was already applied.
--
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- schema.sql and schema-v2.sql must already be applied. If you are setting up
-- a brand-new project, run those two first.
-- ═══════════════════════════════════════════════════════════════════════



-- ─────────────────────────────────────────────────────────────────────
-- schema-v3.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- schema-v4.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- schema-v5.sql
-- ─────────────────────────────────────────────────────────────────────

-- Project Manager — two additions:
--   1. any user (including members) can create their own projects, and
--      whoever created a project owns it for permission purposes;
--   2. self-service password changes become requests an Admin approves.
-- Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- ── Who "owns" a project ────────────────────────────────────────────────
-- The assigned manager if there is one, otherwise whoever created it. This
-- is what decides how much of a project other managers may see.
create or replace function public.project_owner_role(pid uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pr.role from public.projects p
       join public.profiles pr on pr.id = p.manager_id
      where p.id = pid),
    (select pr.role from public.projects p
       join public.profiles pr on pr.id = p.created_by
      where p.id = pid)
  );
$$;

-- ── Any signed-in user may create a project ─────────────────────────────
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert with check (auth.uid() is not null);

-- ── Ownership grants access, regardless of role ─────────────────────────
-- Adds two things to the previous definition:
--   1. the creator can work in their own project even if they're a member;
--   2. managers get full access to member-owned projects, matching the
--      "managers oversee users" rule (admin-owned projects stay private,
--      and other managers' projects stay read-only via can_view_project).
create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.projects p where p.id = pid and p.manager_id = auth.uid())
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    or exists (select 1 from public.project_members pm where pm.project_id = pid and pm.user_id = auth.uid())
    or (public.is_manager() and public.project_owner_role(pid) = 'member');
$$;

create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    or (public.is_manager() and (
      exists (select 1 from public.projects p where p.id = pid and p.manager_id = auth.uid())
      or public.project_owner_role(pid) = 'member'
    ));
$$;

-- can_view_project (schema-v4.sql) is unchanged — it still layers read-only
-- cross-manager visibility on top of can_access_project. Every policy calls
-- these functions rather than inlining the logic, so redefining them here is
-- enough; no policies need rewriting.

-- ── Password change requests ────────────────────────────────────────────
-- A user setting their own password no longer applies it directly; it files
-- a request the Admin approves from Settings → Password Requests. The
-- proposed password is stored with the same AES-256-GCM encryption used by
-- public.credentials (src/lib/crypto.ts) so the Admin can review it before
-- approving and the approval can actually apply it.
create table if not exists public.password_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  encrypted_password text not null,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

alter table public.password_change_requests enable row level security;

-- Rows are written and resolved exclusively by server actions using the
-- service-role client (which encrypts/decrypts with the server-only key),
-- so only a read policy is needed here.
drop policy if exists "password_change_requests_select" on public.password_change_requests;
create policy "password_change_requests_select" on public.password_change_requests
  for select using (public.is_admin() or user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.password_change_requests;
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────────────
-- schema-v6.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- schema-v7.sql
-- ─────────────────────────────────────────────────────────────────────

-- Project Manager — delete requests can now cover whole projects, not just
-- tasks. Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- delete_requests (schema-v3.sql) was task-only. `kind` tells the two apart:
--   'task'    → task_id points at the task to delete
--   'project' → task_id is null; project_id IS the target
-- Existing rows are all task requests, hence the default.
alter table public.delete_requests
  add column if not exists kind text not null default 'task';

do $$ begin
  alter table public.delete_requests
    add constraint delete_requests_kind_check check (kind in ('task', 'project'));
exception when duplicate_object then null; end $$;

-- task_name doubles as the display label for both kinds — it holds the
-- project's name on a 'project' request. It's captured at request time on
-- purpose, so Settings can still say what was deleted after the row it
-- pointed at is gone.
comment on column public.delete_requests.task_name is
  'Display name of whatever is being deleted: the task name, or the project name when kind = ''project''.';

-- Members can't delete a project directly (projects_delete stays on
-- can_manage_project, per schema-v6.sql) but they can ask. The existing
-- delete_requests_insert policy already allows anyone with project access to
-- file a request, so nothing further is needed here.


-- ─────────────────────────────────────────────────────────────────────
-- schema-v8.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- schema-v9.sql
-- ─────────────────────────────────────────────────────────────────────

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



-- ─────────────────────────────────────────────────────────────────────
-- schema-v10.sql
-- ─────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- Project Manager — schema v10
--
-- The big one. Adds Organizations as the top of the hierarchy, removes every
-- "default" visibility rule, and adds the tables behind audit logging, import
-- history and in-app notifications.
--
--   Organization  →  Projects  →  Categories  →  Tasks  →  Subtasks
--
-- Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Requires schema.sql … schema-v9.sql (or schema-catch-up.sql) first.
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. Organizations
-- ─────────────────────────────────────────────────────────────────────
-- An organization is a tenancy boundary: one of the companies the Admin
-- works with. The Admin creates organizations and staffs them; a Manager
-- placed in one can see that organization's people (to staff projects with)
-- and nothing outside it.
--
-- Belonging to an organization does NOT grant sight of its projects. That
-- still requires being assigned to the project itself — see can_access_project
-- below. Organization membership only controls *who you can see*, project
-- assignment controls *what you can see*.

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  logo_url    text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

alter table public.projects
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists projects_organization_idx
  on public.projects (organization_id);

-- Which organization a user created a profile under. Informational — the
-- authoritative link is organization_members — but it records provenance for
-- users a Manager creates.
alter table public.profiles
  add column if not exists created_by uuid references public.profiles(id) on delete set null;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Organization helper functions
-- ─────────────────────────────────────────────────────────────────────
-- All security definer: policies call them, so they must not re-enter RLS.

create or replace function public.is_org_member(oid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members om
    where om.org_id = oid and om.user_id = uid
  );
$$;

-- Do I share at least one organization with this user?
create or replace function public.shares_org(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = uid
  );
$$;

-- Do I share at least one project with this user? Covers both rosters
-- (assigned managers and staffed members) in either direction, so people
-- working together can always see each other's names even if an
-- organization link is missing.
create or replace function public.shares_project(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with mine as (
    select project_id from public.project_members where user_id = auth.uid()
    union
    select project_id from public.project_managers where user_id = auth.uid()
  ), theirs as (
    select project_id from public.project_members where user_id = uid
    union
    select project_id from public.project_managers where user_id = uid
  )
  select exists (select 1 from mine join theirs using (project_id));
$$;

-- The organization a project belongs to, resolved without touching
-- public.projects' own RLS.
create or replace function public.project_org_id(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.projects where id = pid;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Backfill: existing deployments get one organization holding everything
-- ─────────────────────────────────────────────────────────────────────
-- Without this, applying v10 to a live database would orphan every existing
-- project and empty every user picker. Runs only when no organization exists,
-- so re-running the file after you've created real organizations is a no-op.

do $$
declare
  default_org uuid;
begin
  if not exists (select 1 from public.organizations) then
    insert into public.organizations (name, description, created_by)
    values (
      'Main Organization',
      'Created automatically when Organizations were introduced. Everything that existed beforehand lives here — rename it, or move projects into new organizations.',
      (select id from public.profiles where role = 'admin' order by created_at limit 1)
    )
    returning id into default_org;

    insert into public.organization_members (org_id, user_id)
    select default_org, id from public.profiles
    on conflict do nothing;

    update public.projects set organization_id = default_org where organization_id is null;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Project access — every "default view" rule removed
-- ─────────────────────────────────────────────────────────────────────
-- Previously a Manager could see every project not owned by the Admin, and
-- had full write access to any member-owned project. Both are gone. Access is
-- now explicit and identical in shape for every role:
--
--   you are an assigned manager  ·  you created it  ·  you are a staffed member
--
-- The Admin still sees everything. Nobody else sees anything they weren't
-- put on.

create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_project_manager(pid, auth.uid())
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    or exists (select 1 from public.project_members pm where pm.project_id = pid and pm.user_id = auth.uid());
$$;

-- "May delete things here". Admins, plus Managers assigned to (or who
-- created) this project. A member who created a project can edit it but still
-- routes deletions through delete_requests — see can_edit_project.
create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.is_manager() and (
      public.is_project_manager(pid, auth.uid())
      or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    ));
$$;

create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_project(pid)
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid());
$$;

-- Cross-manager read-only visibility (schema-v4.sql) is retired. The function
-- stays — many policies call it — but it no longer widens anything beyond
-- can_access_project.
create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_access_project(pid);
$$;

-- Same snapshot-safety shape as schema-v8/v9: read the row's own columns and
-- consult other tables, never re-query public.projects from inside its own
-- policy (that breaks `insert ... returning`).
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
  );

-- Anyone signed in may still create a project, but it has to land in an
-- organization they actually belong to.
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert with check (
    auth.uid() is not null
    and (
      organization_id is null
      or public.is_admin()
      or public.is_org_member(organization_id, auth.uid())
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 5. Who can see whom
-- ─────────────────────────────────────────────────────────────────────
-- profiles used to be readable by every signed-in user, which leaked one
-- company's staff list to another's Manager. Now: yourself, the Admin
-- (always visible so their comments and assignments render with a name),
-- anyone in an organization you share, and anyone on a project you share.

drop policy if exists "profiles_select_all_authenticated" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() is not null
    and (
      id = auth.uid()
      or role = 'admin'
      or public.is_admin()
      or public.shares_org(id)
      or public.shares_project(id)
    )
  );

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations
  for select using (public.is_admin() or public.is_org_member(id, auth.uid()));

-- Only the Admin creates, renames or removes organizations.
drop policy if exists "organizations_write_admin" on public.organizations;
create policy "organizations_write_admin" on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "organization_members_select" on public.organization_members;
create policy "organization_members_select" on public.organization_members
  for select using (public.is_admin() or public.is_org_member(org_id, auth.uid()));

-- Staffing an organization is an Admin job. Managers who create a user get
-- them added to the Manager's own organizations by the server action, using
-- the service-role client.
drop policy if exists "organization_members_write_admin" on public.organization_members;
create policy "organization_members_write_admin" on public.organization_members
  for all using (public.is_admin()) with check (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────
-- 6. Audit log — account-scoped, never visible to a Manager
-- ─────────────────────────────────────────────────────────────────────
-- A record of what each person did, readable by that person and by the Admin.
-- Deliberately NOT readable by a project's managers: it's the account
-- holder's own record of their work, not a supervision tool. (The Admin can
-- also just switch into an account, at which point auth.uid() is that user
-- and they see the same feed the user sees.)

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete cascade,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  entity_name  text,
  project_id   uuid references public.projects(id) on delete set null,
  project_name text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_actor_created_idx
  on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_own_or_admin" on public.audit_log;
create policy "audit_log_select_own_or_admin" on public.audit_log
  for select using (actor_id = auth.uid() or public.is_admin());

-- Rows are written server-side with the service-role client so entries can't
-- be forged or suppressed from the browser; no insert policy is granted.


-- ─────────────────────────────────────────────────────────────────────
-- 7. Import history
-- ─────────────────────────────────────────────────────────────────────
-- One row per import run, and a back-reference on every task it created, so
-- "show me only what came in from this file" is a single filter.

create table if not exists public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  file_name     text not null,
  source        text not null default 'csv',
  imported_by   uuid references public.profiles(id) on delete set null,
  row_count     int not null default 0,
  created_count int not null default 0,
  warnings      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists import_batches_project_idx
  on public.import_batches (project_id, created_at desc);

alter table public.tasks
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;

create index if not exists tasks_import_batch_idx
  on public.tasks (import_batch_id);

alter table public.import_batches enable row level security;

drop policy if exists "import_batches_select" on public.import_batches;
create policy "import_batches_select" on public.import_batches
  for select using (public.can_access_project(project_id));

drop policy if exists "import_batches_insert" on public.import_batches;
create policy "import_batches_insert" on public.import_batches
  for insert with check (public.can_access_project(project_id));

drop policy if exists "import_batches_delete" on public.import_batches;
create policy "import_batches_delete" on public.import_batches
  for delete using (public.can_manage_project(project_id));


-- ─────────────────────────────────────────────────────────────────────
-- 8. Notifications
-- ─────────────────────────────────────────────────────────────────────
-- Two tables working together:
--
--   project_events  — one row per thing that happened, scoped to a project.
--                     This is what the Admin's per-project Kanban board reads.
--   notifications   — one row per *person who should hear about it*, which is
--                     what each user's own notification tab reads.
--
-- Splitting them keeps the Admin board free of the duplicate rows you'd get
-- from fanning one comment out to four recipients.

create table if not exists public.project_events (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete set null,
  actor_id       uuid references public.profiles(id) on delete set null,
  type           text not null,
  title          text not null,
  body           text,
  meta           jsonb,
  read_by_admin_at timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists project_events_project_created_idx
  on public.project_events (project_id, created_at desc);

alter table public.project_events enable row level security;

drop policy if exists "project_events_select" on public.project_events;
create policy "project_events_select" on public.project_events
  for select using (public.is_admin() or public.can_access_project(project_id));

drop policy if exists "project_events_insert" on public.project_events;
create policy "project_events_insert" on public.project_events
  for insert with check (public.can_access_project(project_id));

-- Only the Admin marks board cards as read; it's their board.
drop policy if exists "project_events_update_admin" on public.project_events;
create policy "project_events_update_admin" on public.project_events
  for update using (public.is_admin()) with check (public.is_admin());

-- Enough context on a notification to render it and to deep-link straight to
-- the task it's about.
alter table public.notifications add column if not exists event_id   uuid references public.project_events(id) on delete cascade;
alter table public.notifications add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.notifications add column if not exists task_id    uuid references public.tasks(id) on delete set null;
alter table public.notifications add column if not exists actor_id   uuid references public.profiles(id) on delete set null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

do $$ begin
  alter publication supabase_realtime add table public.project_events;
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 9. Notes on what deliberately did NOT change
-- ─────────────────────────────────────────────────────────────────────
--   tasks_insert / tasks_update   → can_access_project  (members add + edit)
--   tasks_delete                  → can_manage_project  (delete requests)
--   categories_delete             → can_manage_project
--   projects_delete               → can_manage_project
--   project_members_*             → can_access/can_manage_project
--
-- All of those call the functions redefined in section 4, so tightening the
-- functions tightened every policy at once — no policy rewrites needed.
