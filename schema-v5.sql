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
