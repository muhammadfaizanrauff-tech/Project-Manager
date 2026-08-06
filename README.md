# Project Manager

Real-time project & task management — Next.js (App Router) + Supabase.
Created by Faizan Rauf.

## Stack

- Next.js 16 (App Router, TypeScript) + Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Realtime, Storage) with Row-Level Security
- Recharts (dashboards), dnd-kit (Kanban), papaparse (CSV import), xlsx + jsPDF (export)
- Resend (email notifications)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com/dashboard).

3. **Run the schema.** In your Supabase project, open **SQL Editor → New query** and run,
   in order:

   | File | What it adds |
   |---|---|
   | [`schema.sql`](./schema.sql) | Core tables, RLS policies, triggers, default statuses |
   | [`schema-v2.sql`](./schema-v2.sql) | Subtasks, dependencies, labels, time tracking, recurrence, favourites, notifications |
   | [`schema-catch-up.sql`](./schema-catch-up.sql) | Everything from v3 through v10, concatenated |

   Every file is idempotent (`create table if not exists`, `drop policy if exists` …
   `create policy`), so re-running any of them is safe. An **existing deployment**
   only needs `schema-catch-up.sql` — or just [`schema-v10.sql`](./schema-v10.sql) if
   it is already on v9.

   **v10 is a significant change** — it introduces Organizations and removes every
   "default" visibility rule. See *Organizations & visibility* below before running it.

4. **Create a storage bucket for project logos.** Copy `.env.local` from the example below,
   fill in your Supabase keys, then run:

   ```bash
   node scripts/setup-storage.mjs
   ```

5. **Copy environment variables:**

   ```bash
   cp .env.example .env.local
   ```

   Fill in (from Supabase **Project Settings → API**):

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=       # server-side only, never expose to the client
   CREDENTIALS_ENCRYPTION_KEY=      # 32-byte hex string, e.g. `openssl rand -hex 32`
   RESEND_API_KEY=                  # optional — email notifications no-op without it
   NEXT_PUBLIC_APP_NAME=Project Manager
   ```

6. **Create the Admin account.** With `.env.local` filled in, run:

   ```bash
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword ADMIN_NAME="Your Name" \
     node scripts/seed-admin.mjs
   ```

   This creates the Supabase Auth user, sets `profiles.role = 'admin'`, and stores an
   encrypted copy of the password (so the Admin panel can display/change it later, per
   the product spec's password-visibility requirement).

7. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with the Admin
   account you just created.

## Organizations & visibility (schema-v10)

The hierarchy is **Organization → Project → Category → Task**, and two rules decide
who sees what:

- **Organization membership decides who you can *see*.** A Manager placed in an
  organization can find that organization's people when staffing a project, and
  nobody outside it. One company's manager never learns another company's staff list.
- **Project assignment decides what you can *open*.** A project is visible only to the
  Admin, its assigned managers, its assigned members, and whoever created it. There is
  no role-wide or organization-wide default view — a new project is visible to its
  creator alone until someone is assigned.

Applying `schema-v10.sql` to a database that already has data creates a single
**"Main Organization"**, puts every existing user in it, and files every existing
project under it — so nothing disappears on upgrade. Split it into real organizations
from **Settings → Organizations** afterwards.

Managers may switch into (impersonate) only **Members of their own organizations** —
never a fellow manager, and never the Admin.

## The Handbook

The app documents itself. **`/handbook`** is a full manual covering the hierarchy, a
system-map diagram, the complete role/permission matrix, and every feature. The small
**?** markers throughout the UI each link to the relevant handbook section, so the ids
in `src/app/(app)/handbook/handbook-content.tsx` are load-bearing — rename the titles
freely, but keep the section ids stable.

## Security note: encrypted credentials

The `credentials` table stores each user's password **encrypted** (AES-256-GCM) using
`CREDENTIALS_ENCRYPTION_KEY`, which lives only in server environment variables — never
in the database. This lets the Admin role view/change any user's password, per the
product spec. This is a deliberate trade-off: anyone with Admin access or database
access can read passwords. **Enabling 2FA on the Admin account is strongly
recommended** once implemented; for now, keep the Admin credentials tightly held.

## Deploying to production (Vercel + Supabase + your domain)

Your Supabase project already holds your data — deployment just puts the Next.js app
on the public internet and points your domain at it.

1. **Push this repo to GitHub** (create an empty repo, then `git push`).
2. **Import the repo into Vercel:** [vercel.com/new](https://vercel.com/new) → select
   the repo → it auto-detects Next.js.
3. **Add environment variables in Vercel** (Project → Settings → Environment
   Variables) — the same keys as `.env.local` above, for the Production environment.
4. **Deploy.** Vercel gives you a `https://<project>.vercel.app` URL.
5. **Point your domain via cPanel DNS:**
   - In Vercel → Project → Settings → Domains, add your subdomain (e.g.
     `app.yourdomain.com`) — Vercel shows you the exact CNAME target
     (`cname.vercel-dns.com`).
   - In cPanel → **Zone Editor** (or DNS Zone Editor), add a **CNAME** record:
     `app` → `cname.vercel-dns.com`.
   - Wait for DNS to propagate (usually minutes to an hour), then Vercel automatically
     issues an SSL certificate for the domain.
6. **Email notifications (optional):** create a free [Resend](https://resend.com)
   account, verify a sending domain, and add `RESEND_API_KEY` to Vercel's environment
   variables. Without it, the app runs fine — notification emails are silently
   skipped (logged as a warning) rather than failing.

From then on, every `git push` to your main branch redeploys automatically.

## Scripts

- `scripts/setup-storage.mjs` — creates the public `project-logos` Storage bucket (run once).
- `scripts/seed-admin.mjs` — creates/updates the Admin account (safe to re-run).

## Project structure

- `schema.sql`, `schema-v2.sql` … `schema-v10.sql` — the database, applied in order.
  `schema-catch-up.sql` bundles v3–v10 for convenience.
- `src/app/(app)/` — authenticated app shell (dashboard, projects, notifications,
  settings, handbook).
- `src/app/(app)/projects/[id]/` — project workspace: table/Kanban/dashboard views,
  CSV import, export, comments.
- `src/app/(app)/notifications/` — personal notification list, plus the Admin's
  per-project activity board.
- `src/app/(app)/handbook/` — the in-app manual and system-map diagram.
- `src/lib/` — Supabase clients, auth helpers, data-fetching functions, email/crypto
  utilities, plus `organizations.ts`, `notifications.ts`, `audit.ts` and `imports.ts`.
