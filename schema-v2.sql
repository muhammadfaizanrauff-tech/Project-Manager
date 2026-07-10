-- Project Manager — schema additions for the v2 feature set (subtasks,
-- dependencies, labels, time tracking, recurrence, activity log,
-- favorites, notifications). Idempotent — safe to re-run.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- ── New columns on tasks ────────────────────────────────────────────────
alter table public.tasks add column if not exists estimate_minutes int;
alter table public.tasks add column if not exists recurrence text not null default 'none';
alter table public.tasks add column if not exists recurrence_parent_id uuid references public.tasks(id) on delete set null;

do $$ begin
  alter table public.tasks add constraint tasks_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly'));
exception when duplicate_object then null; end $$;

-- ── New tables ──────────────────────────────────────────────────────────
create table if not exists public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  name        text not null,
  is_done     boolean not null default false,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.task_dependencies (
  task_id             uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id  uuid not null references public.tasks(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.labels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  color       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.task_labels (
  task_id   uuid not null references public.tasks(id) on delete cascade,
  label_id  uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

create table if not exists public.time_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  minutes     int not null check (minutes > 0),
  note        text,
  logged_at   timestamptz not null default now()
);

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── Helper: resolve a task's project for RLS checks ────────────────────
create or replace function public.task_project_id(tid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = tid;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.subtasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.time_logs enable row level security;
alter table public.activity_log enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "subtasks_select" on public.subtasks;
create policy "subtasks_select" on public.subtasks
  for select using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "subtasks_insert" on public.subtasks;
create policy "subtasks_insert" on public.subtasks
  for insert with check (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "subtasks_update" on public.subtasks;
create policy "subtasks_update" on public.subtasks
  for update using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "subtasks_delete" on public.subtasks;
create policy "subtasks_delete" on public.subtasks
  for delete using (public.can_access_project(public.task_project_id(task_id)));

drop policy if exists "task_dependencies_select" on public.task_dependencies;
create policy "task_dependencies_select" on public.task_dependencies
  for select using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "task_dependencies_insert" on public.task_dependencies;
create policy "task_dependencies_insert" on public.task_dependencies
  for insert with check (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "task_dependencies_delete" on public.task_dependencies;
create policy "task_dependencies_delete" on public.task_dependencies
  for delete using (public.can_access_project(public.task_project_id(task_id)));

drop policy if exists "labels_select" on public.labels;
create policy "labels_select" on public.labels
  for select using (public.can_access_project(project_id));
drop policy if exists "labels_insert" on public.labels;
create policy "labels_insert" on public.labels
  for insert with check (public.can_access_project(project_id));
drop policy if exists "labels_delete" on public.labels;
create policy "labels_delete" on public.labels
  for delete using (public.can_manage_project(project_id));

drop policy if exists "task_labels_select" on public.task_labels;
create policy "task_labels_select" on public.task_labels
  for select using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "task_labels_insert" on public.task_labels;
create policy "task_labels_insert" on public.task_labels
  for insert with check (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "task_labels_delete" on public.task_labels;
create policy "task_labels_delete" on public.task_labels
  for delete using (public.can_access_project(public.task_project_id(task_id)));

drop policy if exists "time_logs_select" on public.time_logs;
create policy "time_logs_select" on public.time_logs
  for select using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "time_logs_insert" on public.time_logs;
create policy "time_logs_insert" on public.time_logs
  for insert with check (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "time_logs_delete" on public.time_logs;
create policy "time_logs_delete" on public.time_logs
  for delete using (user_id = auth.uid() or public.can_manage_project(public.task_project_id(task_id)));

drop policy if exists "activity_log_select" on public.activity_log;
create policy "activity_log_select" on public.activity_log
  for select using (public.can_access_project(public.task_project_id(task_id)));
drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert" on public.activity_log
  for insert with check (public.can_access_project(public.task_project_id(task_id)));

drop policy if exists "favorites_all_own" on public.favorites;
create policy "favorites_all_own" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());
drop policy if exists "notifications_insert_authenticated" on public.notifications;
create policy "notifications_insert_authenticated" on public.notifications
  for insert with check (auth.uid() is not null);

-- ── Realtime ────────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.subtasks;
exception when duplicate_object then null; end $$;
