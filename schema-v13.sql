-- schema-v13.sql
--
-- Folders, one level above projects.
--
-- The hierarchy becomes Organization → Folder → Project → Category → Task.
-- A folder is filing, not permission: putting a project in a folder changes
-- nothing about who can open it. can_access_project() is still exactly the
-- project's managers, its members, its creator, and the Admin — a folder full
-- of projects is *not* a way to grant someone access to them.
--
-- Folders belong to an organization, which is what makes "which folder should
-- this person's project go in" answerable without asking them: their
-- organization has a default folder, and every organization gets one here.
--
-- Idempotent like every other schema file here — safe to re-run.

-- ── 1. The table ────────────────────────────────────────────────────────
create table if not exists public.project_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  position        int not null default 0,
  -- Where projects land when nobody picked a folder. Exactly one per
  -- organization, enforced by the partial unique index below.
  is_default      boolean not null default false,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Case-insensitive: "Client Work" and "client work" in one organization are
-- the same folder as far as a person reading the list is concerned.
create unique index if not exists project_folders_org_name_idx
  on public.project_folders (organization_id, lower(name));

create unique index if not exists project_folders_one_default_idx
  on public.project_folders (organization_id) where is_default;

-- ── 2. Projects point at a folder ───────────────────────────────────────
-- Nullable, and `on delete set null`: existing projects predate folders, and
-- deleting a folder must never take projects with it. A null folder_id shows
-- in the UI as "Unfiled".
alter table public.projects
  add column if not exists folder_id uuid references public.project_folders(id) on delete set null;

create index if not exists projects_folder_idx on public.projects (folder_id);

-- ── 3. Every organization gets a default folder ─────────────────────────
-- Guarded by `not exists` rather than `on conflict`, so re-running this file
-- never renames or duplicates a default folder someone has since edited.
insert into public.project_folders (organization_id, name, is_default, position)
select o.id, 'General', true, 0
  from public.organizations o
 where not exists (
   select 1
     from public.project_folders f
    where f.organization_id = o.id
      and f.is_default
 );

-- Existing projects are filed into their own organization's default folder, so
-- nobody opens the page after this migration to find everything "Unfiled".
update public.projects p
   set folder_id = f.id
  from public.project_folders f
 where p.folder_id is null
   and p.organization_id is not null
   and f.organization_id = p.organization_id
   and f.is_default;

-- ── 4. Integrity ────────────────────────────────────────────────────────
-- A project must not sit in a folder belonging to a different organization.
-- Deliberately lenient about nulls: project creation inserts the row and only
-- then stamps the organization on it in one edge case (see `fileAfterInsert`
-- in projects/actions.ts), and that intermediate state has to be allowed.
create or replace function public.projects_folder_matches_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  folder_org uuid;
begin
  if new.folder_id is null or new.organization_id is null then
    return new;
  end if;

  select organization_id into folder_org
    from public.project_folders
   where id = new.folder_id;

  if folder_org is not null and folder_org <> new.organization_id then
    raise exception 'That folder belongs to a different organization.';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_folder_org_check on public.projects;
create trigger projects_folder_org_check
  before insert or update of folder_id, organization_id on public.projects
  for each row execute function public.projects_folder_matches_org();

-- The default folder is the fallback the whole feature leans on, so it can't
-- be deleted out from under everyone. Rename it freely; it just has to exist.
--
-- The organizations check is what keeps `delete from organizations` working:
-- the folder rows go with it via `on delete cascade`, and that cascade runs
-- this trigger. By then the parent row is already gone in this transaction, so
-- "the organization still exists" is precisely the difference between someone
-- deleting a folder they shouldn't and an organization taking its own folders
-- with it. Security definer so the lookup isn't filtered by RLS.
create or replace function public.project_folders_guard_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_default and exists (
    select 1 from public.organizations o where o.id = old.organization_id
  ) then
    raise exception 'An organization''s default folder cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists project_folders_guard_default_delete on public.project_folders;
create trigger project_folders_guard_default_delete
  before delete on public.project_folders
  for each row execute function public.project_folders_guard_default();

-- ── 5. Who may do what ──────────────────────────────────────────────────
-- Seeing folders follows organization membership, exactly like organizations
-- themselves (schema-v10). Creating and editing them is an Admin or a Manager
-- of that organization — a member files projects into existing folders but
-- doesn't invent new ones.
create or replace function public.can_manage_folders(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_manager() and public.is_org_member(oid, auth.uid()));
$$;

alter table public.project_folders enable row level security;

drop policy if exists "project_folders_select" on public.project_folders;
create policy "project_folders_select" on public.project_folders
  for select using (
    public.is_admin() or public.is_org_member(organization_id, auth.uid())
  );

drop policy if exists "project_folders_insert" on public.project_folders;
create policy "project_folders_insert" on public.project_folders
  for insert with check (public.can_manage_folders(organization_id));

drop policy if exists "project_folders_update" on public.project_folders;
create policy "project_folders_update" on public.project_folders
  for update using (public.can_manage_folders(organization_id))
  with check (public.can_manage_folders(organization_id));

drop policy if exists "project_folders_delete" on public.project_folders;
create policy "project_folders_delete" on public.project_folders
  for delete using (public.can_manage_folders(organization_id));

-- Moving a project between folders is an edit of the project, so it is already
-- governed by projects_update → can_manage_project(). No new policy needed:
-- whoever may rename a project may re-file it.
