# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint (flat config, next/core-web-vitals + next/typescript)
```

There is no test suite/runner configured in this repo.

One-off scripts (need `.env.local` populated first):

```bash
node scripts/setup-storage.mjs   # creates the public "project-logos" Storage bucket (run once)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword ADMIN_NAME="Your Name" \
  node scripts/seed-admin.mjs    # creates/updates the Admin account (safe to re-run)
```

Database changes are plain SQL files run by hand in the Supabase SQL editor — there is no
migration tool. `schema.sql`, then `schema-v2.sql`, then `schema-v3.sql` … up to the highest
`schema-vN.sql`, in that order; all are idempotent (`create table if not exists`,
`drop policy if exists` ... `create policy`) so re-running any of them is safe.
`schema-catch-up.sql` is v3-onwards concatenated, for bringing an old deployment forward in one
paste. **When you add/change tables, RLS policies, or triggers, add a new `schema-vN.sql` file
rather than editing an already-applied one** — existing Supabase projects only pick up new files
— and append the same content to `schema-catch-up.sql`.

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript, Supabase (Postgres/Auth/Realtime/
Storage) with Row-Level Security as the sole authorization layer, Tailwind v4 + shadcn/ui
(`components.json`, style `base-nova`), dnd-kit (Kanban), recharts (dashboards), papaparse/xlsx
(CSV import/export), jsPDF (PDF export), Resend (email), `motion` for animation.

### This is not the Next.js in your training data

Next.js 16 renamed `middleware.ts` → `src/proxy.ts`, exporting a `proxy()` function instead of
`middleware()` (see `src/proxy.ts` / `src/lib/supabase/middleware.ts`). Before touching routing,
middleware/proxy, caching, or data-fetching APIs, check `node_modules/next/dist/docs/` — don't
assume pre-16 conventions apply.

### Tenancy: Organizations → Projects → Categories → Tasks

`schema-v10.sql` put **organizations** at the top of the hierarchy and deleted every
"default" visibility rule that came before it. Two orthogonal rules now decide access, and
conflating them is the easiest mistake to make here:

- **`organization_members` decides who you can *see*.** It scopes the people pickers, the
  Settings → Users list, and who a Manager may impersonate. It grants **no** project access
  whatsoever.
- **`project_managers` / `project_members` / `projects.created_by` decide what you can *open*.**
  `can_access_project()` is exactly those three plus `is_admin()` — nothing role-wide, nothing
  organization-wide. A freshly created project is visible to its creator alone.

Consequences worth remembering before "fixing" something that looks broken:

- A Manager seeing no projects is correct if they aren't assigned to any. Earlier schema
  versions (v4/v5/v8/v9) gave managers a blanket view of non-admin projects; v10 removed it
  deliberately. `can_view_project()` still exists because many policies call it, but it is now
  just an alias for `can_access_project()`.
- `profiles` is no longer world-readable to authenticated users. The policy is self, admins,
  `shares_org()`, `shares_project()` — so a nested select like `assignee:assignee_id(full_name)`
  can legitimately return null for someone outside your organization.
- Server-side code that needs to reason about *another* user's visibility (staffing pickers,
  impersonation checks, `listManagedUsers`) goes through `src/lib/organizations.ts`, which uses
  the service client on purpose — relying on the caller's own RLS view there would be circular.

### Auth & authorization model

Three roles (`public.app_role`: `admin` > `manager` > `member`), enforced almost entirely in
Postgres via RLS, not in application code:

- `src/proxy.ts` (edge) — redirects unauthenticated requests to `/login` for any non-public path
  (public paths: `/`, `/login`, `/change-password`, `/auth`) and refreshes the Supabase session
  cookie every request.
- `src/lib/supabase/{server,client,middleware,service}.ts` — four distinct Supabase client
  constructors, each for a specific context:
  - `server.ts` — Server Components/Actions, cookie-bound, respects RLS as the calling user.
  - `client.ts` — browser client (Client Components), respects RLS.
  - `middleware.ts` — used only by `proxy.ts` for session refresh/redirect.
  - `service.ts` — `server-only`, uses the service-role key, **bypasses RLS entirely**. Only call
    this after verifying the caller's role yourself (e.g. admin-only user management, reading
    another user's email for notifications). Never import it into client code.
- `src/lib/auth.ts` — `requireUser()` / `getCurrentProfile()` helpers used at the top of
  Server Components and Actions to gate access and read the caller's role.
- SQL-side helper functions in `schema.sql` (`current_role()`, `is_admin()`, `is_manager()`,
  `can_access_project(pid)`, `can_manage_project(pid)`) are `security definer` to avoid RLS
  self-recursion, and are the real source of truth — RLS policies call them. When adding a new
  table, add matching policies (see `delete_requests` in `schema-v3.sql` for the current pattern),
  not just an application-level check.
- `public.credentials` stores each user's password **encrypted** (AES-256-GCM, via
  `src/lib/crypto.ts` and `CREDENTIALS_ENCRYPTION_KEY`, a server-only env var never persisted in
  the DB) so Admins can view/reset any user's password from Settings. This is a deliberate,
  documented trade-off — see README's "Security note" — not an oversight; don't "fix" it by
  silently hashing instead without flagging the product-spec conflict to the user.

### Route structure

- `src/app/(app)/` — authenticated shell, wrapped by `src/app/(app)/layout.tsx` which calls
  `requireUser()`/`getCurrentProfile()` and renders `AppShell` (sidebar, favorites, role-aware nav).
  - `dashboard/` — cross-project ("global") dashboard + global CSV import.
  - `projects/` — project list/grid, project creation.
  - `projects/[id]/` — the project workspace (`project-workspace.tsx` composes table view,
    Kanban view, and per-project dashboard as tabs), plus task sheet (detail drawer with
    checklist/links/time-tracking sub-panels), CSV import/export, comments, delete-requests.
  - `settings/` — tabbed: profile, organizations (admin), users, my activity (audit),
    import history, statuses (admin), meeting links, delete-requests and password-requests
    review (admin).
  - `notifications/` — everyone's personal notification list; the Admin additionally gets a
    per-project Kanban board of `project_events`.
  - `handbook/` — the in-app manual. Its section ids are the anchor targets for every
    `<HelpTip topic="…">` in the app, so keep them stable.
- `src/app/login/`, `src/app/change-password/`, `src/app/auth/callback/` — outside the app shell,
  public paths per `proxy.ts`.
- Everything under `src/app` that mutates data is a `"use server"` Server Action file
  (`*-actions.ts` next to the page that uses it), not an API route — there is no `src/app/api/`.
  Actions follow the same shape throughout: build a Supabase client, mutate, `revalidatePath` the
  affected project/dashboard route, return `{ data }` / `{ error }` / `{ ok: true }` (never throw
  across the server/client boundary).

### Data layer (`src/lib/`)

Read-oriented data fetchers (`projects.ts`, `tasks.ts`, `dashboard.ts`, `favorites.ts`,
`task-extras.ts`, `users-admin.ts`) are plain `server-only` async functions called directly from
Server Components — there's no separate API/query layer or client-side data-fetching library.
Supabase's nested-select syntax (e.g. `manager:manager_id(id, full_name)`) is used for joins and
comes back needing a manual `as unknown as T` cast (the generated types treat joined rows as
possibly-array). Mutations live in the adjacent `*-actions.ts` files (see above) rather than here.

Side effects that fan out from a task mutation — email notifications (`src/lib/email.ts`, via
Resend, a no-op with a console warning if `RESEND_API_KEY` is unset) and recurrence
(auto-creating the next occurrence of a recurring task when it's marked "Done") — are triggered
from inside `updateTask` in `task-actions.ts` (`handleTaskNotifications`, `handleRecurrence`),
fired with `void` (fire-and-forget) so they don't block the revalidate/response. New task-mutation
side effects should follow that same pattern rather than blocking the calling action.

### Notifications, audit, and imports

Three write-side systems added in v10, all fire-and-forget from the calling action (`void`),
all writing via the service client so they can't be forged or suppressed from the browser:

- **`src/lib/notifications.ts`** — `publishEvent()` writes one `project_events` row (what
  happened, scoped to a project — this is what the Admin's board reads) plus one
  `notifications` row per recipient (what each person sees in their tab). Splitting them avoids
  the duplicate rows you'd get fanning one comment out to four people. Recipients come from
  `projectAudience()` (everyone on the project) or `projectLeads()` (managers/creator), and the
  actor is always removed. Links are built with `taskLink()` so a notification deep-links to
  `/projects/[id]?task=<taskId>`, which `project-workspace.tsx` opens as a drawer.
- **`src/lib/audit.ts`** — `recordAudit()` into `audit_log`. Readable by the actor and the Admin
  only; a project's managers deliberately cannot read their team's. It is `server-only`; the
  types, labels and `auditCategory()` live in **`src/lib/audit-labels.ts`** so Client Components
  can import them without pulling the service key's module graph into the browser bundle.
- **`src/lib/imports.ts`** — every import writes an `import_batches` row *before* the tasks, and
  each task carries `import_batch_id`, which is what powers Filter → Imported batch and
  `?import=<batchId>`.

### Conventions worth matching

- Status/label matching is done by comparing the human-readable label string (e.g.
  `status.label === "Done"`, `NOTIFY_STATUS_LABELS`), not a fixed ID/enum — statuses are a
  per-workspace configurable table (`settings/statuses-tab.tsx`), not hardcoded.
- `revalidatePath` is called explicitly after every mutation; there's no automatic cache
  invalidation, so a new mutation that skips it will show stale data until a hard refresh.
- New user-facing surfaces get a `<HelpTip topic="…">` from `src/components/help-tip.tsx`,
  pointing at a section id in the handbook. If the topic doesn't exist there yet, add it.
- A new mutation should usually do three things beyond the write: `revalidatePath`,
  `void recordAudit(...)`, and — if a human needs to know — `void publishEvent(...)`.
