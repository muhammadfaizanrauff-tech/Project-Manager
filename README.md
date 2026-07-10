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

3. **Run the schema.** In your Supabase project, open **SQL Editor → New query**, paste the
   entire contents of [`schema.sql`](./schema.sql), and click **Run**. This creates all
   tables, RLS policies, triggers, and seeds the default status list.

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

- `schema.sql` — full database schema, RLS policies, triggers, seed data.
- `src/app/(app)/` — authenticated app shell (dashboard, projects, settings).
- `src/app/(app)/projects/[id]/` — project workspace: table/Kanban/dashboard views,
  CSV import, export, comments.
- `src/lib/` — Supabase clients, auth helpers, data-fetching functions, email/crypto utilities.
