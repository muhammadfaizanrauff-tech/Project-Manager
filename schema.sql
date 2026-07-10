-- Project Manager — core database schema, RLS policies, and seed data.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists "pgcrypto";

-- ── Types ─────────────────────────────────────────────────────────────────
do $$ begin
  create type public.app_role as enum ('admin', 'manager', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        public.app_role not null default 'member',
  avatar_url  text,
  theme       text not null default 'light',
  created_at  timestamptz not null default now()
);

-- Encrypted copy of each user's password, decryptable only by the app server
-- (via CREDENTIALS_ENCRYPTION_KEY, never stored in the database) so the
-- Admin can view/change any user's password per the product spec. This is a
-- deliberate security trade-off — anyone with Admin or database access can
-- read passwords. Strongly recommend enabling 2FA on the Admin account.
create table if not exists public.credentials (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  encrypted_password text not null,
  updated_at         timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  manager_id  uuid references public.profiles(id),
  created_by  uuid references public.profiles(id),
  start_date  date not null default current_date,
  end_date    date,
  created_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id  uuid references public.projects(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.statuses (
  id        uuid primary key default gen_random_uuid(),
  label     text not null unique,
  color     text not null,
  position  int not null default 0
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  serial_no    int not null,
  name         text not null,
  description  text,
  priority     public.task_priority not null default 'medium',
  status_id    uuid references public.statuses(id),
  due_date     date,
  assignee_id  uuid references public.profiles(id),
  position     int not null default 0,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid references public.profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.meeting_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  label       text not null,
  url         text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ── Helper functions (security definer avoids RLS recursion) ───────────────
create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'manager';
$$;

create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.projects p where p.id = pid and p.manager_id = auth.uid())
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid())
    or exists (select 1 from public.project_members pm where pm.project_id = pid and pm.user_id = auth.uid());
$$;

create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.is_manager() and exists (
      select 1 from public.projects p
      where p.id = pid and (p.manager_id = auth.uid() or p.created_by = auth.uid())
    ));
$$;

-- ── Triggers ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'member')::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

create or replace function public.set_task_serial()
returns trigger language plpgsql as $$
begin
  if new.serial_no is null then
    select coalesce(max(serial_no), 0) + 1 into new.serial_no
    from public.tasks where project_id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_serial on public.tasks;
create trigger tasks_set_serial
  before insert on public.tasks
  for each row execute procedure public.set_task_serial();

-- ── Row-Level Security ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.credentials enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.categories enable row level security;
alter table public.statuses enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.meeting_links enable row level security;

drop policy if exists "profiles_select_all_authenticated" on public.profiles;
create policy "profiles_select_all_authenticated" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());

drop policy if exists "credentials_select_admin" on public.credentials;
create policy "credentials_select_admin" on public.credentials
  for select using (public.is_admin());

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (public.can_access_project(id));

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert with check (public.is_admin() or public.is_manager());

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update using (public.can_manage_project(id));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete using (public.can_manage_project(id));

drop policy if exists "project_members_select" on public.project_members;
create policy "project_members_select" on public.project_members
  for select using (public.can_access_project(project_id));

drop policy if exists "project_members_insert" on public.project_members;
create policy "project_members_insert" on public.project_members
  for insert with check (public.can_manage_project(project_id));

drop policy if exists "project_members_delete" on public.project_members;
create policy "project_members_delete" on public.project_members
  for delete using (public.can_manage_project(project_id));

drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select using (public.can_access_project(project_id));

drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories
  for insert with check (public.can_access_project(project_id));

drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories
  for update using (public.can_manage_project(project_id));

drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories
  for delete using (public.can_manage_project(project_id));

drop policy if exists "statuses_select" on public.statuses;
create policy "statuses_select" on public.statuses
  for select using (auth.uid() is not null);

drop policy if exists "statuses_write_admin" on public.statuses;
create policy "statuses_write_admin" on public.statuses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (public.can_access_project(project_id));

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (public.can_access_project(project_id));

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (public.can_access_project(project_id));

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (public.can_manage_project(project_id));

drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_access_project(t.project_id))
  );

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_access_project(t.project_id))
  );

drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments
  for delete using (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_manage_project(t.project_id))
  );

drop policy if exists "meeting_links_select" on public.meeting_links;
create policy "meeting_links_select" on public.meeting_links
  for select using (project_id is null or public.can_access_project(project_id));

drop policy if exists "meeting_links_write" on public.meeting_links;
create policy "meeting_links_write" on public.meeting_links
  for all using (
    (project_id is null and (public.is_admin() or public.is_manager()))
    or (project_id is not null and public.can_manage_project(project_id))
  )
  with check (
    (project_id is null and (public.is_admin() or public.is_manager()))
    or (project_id is not null and public.can_manage_project(project_id))
  );

-- ── Realtime ────────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

-- ── Seed default statuses ───────────────────────────────────────────────
insert into public.statuses (label, color, position) values
  ('Not Started', '#64748b', 0),
  ('Started', '#0ea5e9', 1),
  ('In Progress', '#6366f1', 2),
  ('Pending', '#f59e0b', 3),
  ('Pending Approval', '#eab308', 4),
  ('Waiting for Feedback', '#a855f7', 5),
  ('Feedback Asked', '#ec4899', 6),
  ('Done', '#16a34a', 7)
on conflict (label) do nothing;
