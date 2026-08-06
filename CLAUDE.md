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
migration tool. `schema.sql`, then `schema-v2.sql`, then `schema-v3.sql`, in that order; all
three are idempotent (`create table if not exists`, `drop policy if exists` ... `create policy`)
so re-running any of them is safe. **When you add/change tables, RLS policies, or triggers, add a
new `schema-vN.sql` file rather than editing an already-applied one** — existing Supabase projects
only pick up new files.

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
  - `settings/` — tabbed: profile, users (admin), statuses (workflow columns), meeting links,
    delete-requests review (admin approves/rejects member-submitted deletions).
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

### Conventions worth matching

- Status/label matching is done by comparing the human-readable label string (e.g.
  `status.label === "Done"`, `NOTIFY_STATUS_LABELS`), not a fixed ID/enum — statuses are a
  per-workspace configurable table (`settings/statuses-tab.tsx`), not hardcoded.
- `revalidatePath` is called explicitly after every mutation; there's no automatic cache
  invalidation, so a new mutation that skips it will show stale data until a hard refresh.
