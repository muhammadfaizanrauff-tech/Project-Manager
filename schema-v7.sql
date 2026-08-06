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
