-- schema-v11.sql
--
-- Categories: one name per project, enforced by the database.
--
-- Nothing stopped a project from holding two categories called the same thing,
-- and people kept ending up with them: a double-click on Add, a retried Server
-- Action, two people typing the same name at once. The application side is now
-- idempotent (createCategory in task-actions.ts looks the name up first), but
-- an application check can never close the window between two inserts that are
-- already in flight. This does.
--
-- Idempotent like every other schema file here — safe to re-run.

-- 1. Fold any duplicates that already exist into the oldest row of each name,
--    so the index below can actually be created. Tasks are moved across first;
--    nothing is deleted that still has work attached to it.
with ranked as (
  select
    id,
    project_id,
    lower(btrim(name)) as key,
    first_value(id) over (
      partition by project_id, lower(btrim(name))
      order by created_at, id
    ) as keeper
  from public.categories
)
update public.tasks t
   set category_id = r.keeper
  from ranked r
 where t.category_id = r.id
   and r.id <> r.keeper;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by project_id, lower(btrim(name))
      order by created_at, id
    ) as keeper
  from public.categories
)
delete from public.categories c
 using ranked r
 where c.id = r.id
   and r.id <> r.keeper;

-- 2. Names are compared the way people read them: case- and whitespace-
--    insensitive, so "Design", "design" and " Design " are the same category.
create unique index if not exists categories_project_name_unique
  on public.categories (project_id, lower(btrim(name)));

-- Note for the app side: a violation surfaces as Postgres error 23505, which
-- createCategory/renameCategory treat as "someone else already made it" rather
-- than as a failure.
