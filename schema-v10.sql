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
      -- Qualified: bare `role` inside a policy is ambiguous against
      -- Postgres' own CURRENT_ROLE. This means the profiles table's column.
      or profiles.role = 'admin'
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
