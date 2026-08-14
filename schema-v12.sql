-- schema-v12.sql
--
-- Task-level visibility.
--
-- Until now, being on a project meant seeing everything in it: tasks_select
-- granted on can_access_project, which includes every project_members row. A
-- person added to a project to work on three tasks could read all four hundred.
--
-- From here a task is visible to the people who have something to do with it:
--
--   * the Admin;
--   * the project's managers, and whoever created the project — they run it,
--     so they keep the complete picture;
--   * the person the task is assigned to;
--   * the person who created the task.
--
-- Everyone else on the project sees nothing of it. Note what that means in
-- practice while most tasks have no assignee: a member's view is essentially
-- "the tasks I made", which is the intended default.
--
-- Idempotent like every other schema file here — safe to re-run.

-- ── 1. Two helpers ──────────────────────────────────────────────────────
-- Split deliberately: `can_see_all_tasks` is the project-wide half, and is the
-- only part tasks' own policy may use — it consults public.projects and
-- public.project_managers but never public.tasks, so it can't recurse into the
-- policy it's being evaluated for.
create or replace function public.can_see_all_tasks(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_project_manager(pid, auth.uid())
    or exists (select 1 from public.projects p where p.id = pid and p.created_by = auth.uid());
$$;

-- The per-task question, for the tables that hang off a task (comments,
-- checklist items, time logs, …). Security definer, so it reads public.tasks
-- without being filtered by tasks_select — which is the point: it *is* the
-- definition of tasks_select, applied from somewhere else.
create or replace function public.can_view_task(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.tasks t
     where t.id = tid
       and (
         public.can_see_all_tasks(t.project_id)
         or t.assignee_id = auth.uid()
         or t.created_by = auth.uid()
       )
  );
$$;

-- ── 2. The tasks themselves ─────────────────────────────────────────────
-- Written against the row's own columns plus can_see_all_tasks, never against
-- public.tasks — same snapshot-safety shape as schema-v8/v9/v10, so
-- `insert ... returning` keeps working.
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    public.can_see_all_tasks(project_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );

-- Editing follows seeing. Without this a member could still write to a task
-- they can't read, by id.
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    public.can_see_all_tasks(project_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );

-- Left alone on purpose:
--   tasks_insert  → can_access_project   (anyone on the project may add work;
--                                         they then see it as its creator)
--   tasks_delete  → can_manage_project   (members raise delete_requests)

-- ── 3. Everything hanging off a task ────────────────────────────────────
-- These all granted on can_access_project, so tightening tasks_select alone
-- would have left the comment thread, checklist and time log of an invisible
-- task readable by id. Each one now asks the same question the task does.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select using (public.can_view_task(task_id));
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert with check (public.can_view_task(task_id));

drop policy if exists "subtasks_select" on public.subtasks;
create policy "subtasks_select" on public.subtasks
  for select using (public.can_view_task(task_id));
drop policy if exists "subtasks_insert" on public.subtasks;
create policy "subtasks_insert" on public.subtasks
  for insert with check (public.can_view_task(task_id));
drop policy if exists "subtasks_update" on public.subtasks;
create policy "subtasks_update" on public.subtasks
  for update using (public.can_view_task(task_id));
drop policy if exists "subtasks_delete" on public.subtasks;
create policy "subtasks_delete" on public.subtasks
  for delete using (public.can_view_task(task_id));

drop policy if exists "task_dependencies_select" on public.task_dependencies;
create policy "task_dependencies_select" on public.task_dependencies
  for select using (public.can_view_task(task_id));
drop policy if exists "task_dependencies_insert" on public.task_dependencies;
create policy "task_dependencies_insert" on public.task_dependencies
  for insert with check (public.can_view_task(task_id));
drop policy if exists "task_dependencies_delete" on public.task_dependencies;
create policy "task_dependencies_delete" on public.task_dependencies
  for delete using (public.can_view_task(task_id));

drop policy if exists "task_labels_select" on public.task_labels;
create policy "task_labels_select" on public.task_labels
  for select using (public.can_view_task(task_id));
drop policy if exists "task_labels_insert" on public.task_labels;
create policy "task_labels_insert" on public.task_labels
  for insert with check (public.can_view_task(task_id));
drop policy if exists "task_labels_delete" on public.task_labels;
create policy "task_labels_delete" on public.task_labels
  for delete using (public.can_view_task(task_id));

drop policy if exists "time_logs_select" on public.time_logs;
create policy "time_logs_select" on public.time_logs
  for select using (public.can_view_task(task_id));
drop policy if exists "time_logs_insert" on public.time_logs;
create policy "time_logs_insert" on public.time_logs
  for insert with check (public.can_view_task(task_id));
-- time_logs_delete stays "your own entry, or a manager's" — unchanged.

drop policy if exists "activity_log_select" on public.activity_log;
create policy "activity_log_select" on public.activity_log
  for select using (public.can_view_task(task_id));
drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert" on public.activity_log
  for insert with check (public.can_view_task(task_id));

-- Deliberately unchanged:
--   categories_select → can_access_project. Categories are headings, not work;
--     a member still sees the project's structure, with only their own tasks
--     under it. The UI hides the ones that come back empty for them.
--   labels_select     → can_access_project, for the same reason.
--   delete_requests   → already Admin-or-your-own on select.
