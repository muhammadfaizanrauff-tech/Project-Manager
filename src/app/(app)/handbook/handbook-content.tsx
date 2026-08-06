"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileUp,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  Search,
  Shield,
  Trash2,
  Users,
  Workflow,
  XCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SystemMap } from "./system-map";

/**
 * The manual.
 *
 * Section ids here are the anchors every HelpTip links to — a "?" anywhere in
 * the app with `topic="organizations"` scrolls to the section whose id is
 * `organizations`. Keep the ids stable; rename the titles freely.
 */

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  body: React.ReactNode;
};

// ── Small presentational helpers ──────────────────────────────────────────

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 text-sm font-semibold text-foreground">{children}</h3>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
          <ChevronRight className="mt-1 size-3 shrink-0 text-primary/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "good";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-primary/25 bg-primary/[0.05]",
    warn: "border-amber-500/30 bg-amber-500/[0.07]",
    good: "border-emerald-500/30 bg-emerald-500/[0.07]",
  }[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${styles}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Yes() {
  return <CheckCircle2 className="mx-auto size-4 text-emerald-500" aria-label="Yes" />;
}
function No() {
  return <XCircle className="mx-auto size-4 text-muted-foreground/40" aria-label="No" />;
}
function Some({ label }: { label: string }) {
  return (
    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{label}</span>
  );
}

function PermissionMatrix() {
  const rows: { what: string; admin: React.ReactNode; manager: React.ReactNode; member: React.ReactNode }[] =
    [
      { what: "See every project in the workspace", admin: <Yes />, manager: <No />, member: <No /> },
      {
        what: "See a project they're assigned to",
        admin: <Yes />,
        manager: <Yes />,
        member: <Yes />,
      },
      { what: "Create an organization", admin: <Yes />, manager: <No />, member: <No /> },
      { what: "Put people into an organization", admin: <Yes />, manager: <No />, member: <No /> },
      { what: "Create a project", admin: <Yes />, manager: <Yes />, member: <Yes /> },
      {
        what: "Staff a project with people",
        admin: <Yes />,
        manager: <Some label="Own org only" />,
        member: <No />,
      },
      { what: "Assign fellow managers to a project", admin: <Yes />, manager: <Yes />, member: <No /> },
      { what: "Create user accounts", admin: <Yes />, manager: <Some label="Members only" />, member: <No /> },
      {
        what: "See other people's accounts",
        admin: <Yes />,
        manager: <Some label="Own org only" />,
        member: <No />,
      },
      {
        what: "Switch into someone's account",
        admin: <Some label="Not other Admins" />,
        manager: <Some label="Own org members" />,
        member: <No />,
      },
      { what: "View / reset a password", admin: <Yes />, manager: <No />, member: <No /> },
      { what: "Add and edit tasks", admin: <Yes />, manager: <Yes />, member: <Yes /> },
      {
        what: "Delete a task or project",
        admin: <Yes />,
        manager: <Yes />,
        member: <Some label="By request" />,
      },
      { what: "Import tasks from CSV / Excel", admin: <Yes />, manager: <Yes />, member: <No /> },
      { what: "Export reports (PDF / Excel / JSON)", admin: <Yes />, manager: <Yes />, member: <Yes /> },
      { what: "Edit workflow statuses", admin: <Yes />, manager: <No />, member: <No /> },
      { what: "Approve delete & password requests", admin: <Yes />, manager: <No />, member: <No /> },
      { what: "Read their own activity log", admin: <Yes />, manager: <Yes />, member: <Yes /> },
      {
        what: "Read someone else's activity log",
        admin: <Yes />,
        manager: <No />,
        member: <No />,
      },
      { what: "See the per-project notification board", admin: <Yes />, manager: <No />, member: <No /> },
    ];

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Can they…</th>
            <th className="w-24 px-3 py-2 font-medium text-violet-600 dark:text-violet-300">
              Admin
            </th>
            <th className="w-28 px-3 py-2 font-medium text-blue-600 dark:text-blue-300">
              Manager
            </th>
            <th className="w-28 px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
              Member
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.what} className="border-t">
              <td className="px-3 py-2 text-muted-foreground">{row.what}</td>
              <td className="px-3 py-2 text-center">{row.admin}</td>
              <td className="px-3 py-2 text-center">{row.manager}</td>
              <td className="px-3 py-2 text-center">{row.member}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── The sections ──────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "How the whole system fits together",
    icon: LayoutDashboard,
    summary: "The five levels of the hierarchy, and the two rules that decide who sees what.",
    body: (
      <div className="flex flex-col gap-4">
        <P>
          Everything in this app nests inside something else. Reading the map top to bottom tells
          you both what contains what, and who is allowed to look at each level.
        </P>
        <SystemMap />
        <H>The five levels</H>
        <Bullets
          items={[
            <>
              <strong>Workspace</strong> — the whole installation. One Admin sits at the top and
              can see all of it.
            </>,
            <>
              <strong>Organization</strong> — one company or business unit. The Admin creates
              these and decides who belongs to each. This is the wall between your different
              businesses.
            </>,
            <>
              <strong>Project</strong> — a body of work inside one organization, with its own
              managers, members, logo and dates.
            </>,
            <>
              <strong>Category</strong> — a heading that groups tasks inside a project (&ldquo;Design&rdquo;,
              &ldquo;Procurement&rdquo;, &ldquo;Launch&rdquo;).
            </>,
            <>
              <strong>Task</strong> — the actual unit of work, with an assignee, a priority, a
              status and a due date. Inside a task live its checklist, comments, time logs, labels
              and dependencies.
            </>,
          ]}
        />
        <Callout tone="info" title="The two rules, in one line each">
          <p>
            <strong>Organization decides who you can see.</strong> Being in one lets you find its
            people when staffing a project.
          </p>
          <p className="mt-1">
            <strong>Assignment decides what you can open.</strong> A project shows up for you only
            once you are its manager, its member, or the person who created it.
          </p>
        </Callout>
      </div>
    ),
  },
  {
    id: "roles",
    title: "The three roles, and exactly what each can do",
    icon: Shield,
    summary: "Admin, Manager, Member — the full permission matrix.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Admin</H>
        <P>
          You. There is normally one Admin. You see every organization, every project, every task
          and every person, whether or not you are assigned to anything. You are the only one who
          can create organizations, decide who belongs to them, view or reset passwords, edit the
          workflow statuses, and approve delete and password requests. You are also the only one
          who can read another person&apos;s activity log, and the only one with the per-project
          notification board.
        </P>

        <H>Manager</H>
        <P>
          A manager runs one or more companies&apos; work for you. They see the people in{" "}
          <em>their own organizations</em> and nobody else&apos;s — one company&apos;s manager
          never learns another company&apos;s staff list. They see only the projects they have
          been assigned to or created; there is no default view of anyone else&apos;s work. Within
          their projects they have full control: add and delete tasks and categories, staff the
          project, import data, delete the project.
        </P>

        <H>Member</H>
        <P>
          Someone doing the work. They see only the projects they&apos;ve been put on. Inside
          those they can add and edit tasks, comment, tick checklists and log time freely — but
          they cannot delete anything. Instead, deleting raises a request the Admin approves. They
          cannot see other people&apos;s accounts at all.
        </P>

        <H>The full matrix</H>
        <PermissionMatrix />
      </div>
    ),
  },
  {
    id: "organizations",
    title: "Organizations",
    icon: Building2,
    summary: "One per company. Sets who can see whom. Admin-managed.",
    body: (
      <div className="flex flex-col gap-4">
        <P>
          An organization is a wall between the different businesses you run. Its whole job is to
          answer one question: <strong>which people can this person see?</strong>
        </P>

        <H>Setting one up</H>
        <Steps
          items={[
            <>
              Go to <strong>Settings → Organizations</strong> and click{" "}
              <strong>New organization</strong>. Name it after the company.
            </>,
            <>
              Click <strong>People</strong> on the organization&apos;s card and add the managers
              and members who work for that company.
            </>,
            <>
              Those managers can now create projects inside that organization and staff them from
              that roster — and nothing outside it.
            </>,
          ]}
        />

        <Callout tone="warn" title="Membership is not access">
          Putting someone in an organization does <strong>not</strong> show them its projects. It
          only lets them be found in the people pickers. A project stays invisible until someone
          is actually assigned to it.
        </Callout>

        <H>Giving an organization a logo</H>
        <P>
          Click the pencil on an organization&apos;s card. Alongside the name and description
          you can upload a logo — PNG, JPEG, WebP or SVG, up to 2 MB. It appears on the
          organization&apos;s card and beside the organization name on every project filed under
          it, which makes a workspace with several companies far quicker to scan.
        </P>
        <P>
          Uploading a new file replaces the old one. Saving without picking a file keeps the
          current logo — to actually clear it, use <strong>Remove logo</strong> in the same
          dialog. That way re-saving a name change can never wipe the logo by accident.
        </P>

        <H>What happens to people a Manager creates</H>
        <P>
          When a Manager creates a user from Settings → Users, that new account is automatically
          placed into the Manager&apos;s own organizations. Otherwise nobody — not even the person
          who just created them — would be able to staff them onto anything.
        </P>

        <H>Deleting an organization</H>
        <P>
          Its projects are not deleted; they become unassigned and only you can see them until you
          move them into another organization. The user accounts are untouched.
        </P>
      </div>
    ),
  },
  {
    id: "project-visibility",
    title: "Who can see a project",
    icon: FolderKanban,
    summary: "No default view. Assignment is the only way in — plus the Admin.",
    body: (
      <div className="flex flex-col gap-4">
        <Callout tone="good" title="The rule">
          A project is visible to exactly four kinds of person: the Admin; its assigned managers;
          its assigned members; and whoever created it. Nobody else — no matter their role.
        </Callout>

        <H>What that means in practice</H>
        <Bullets
          items={[
            <>
              A brand-new project is visible to <strong>you alone</strong>. It appears for other
              people the moment you add them.
            </>,
            <>
              Add a <strong>member</strong> and they can open it and work on it, but they
              can&apos;t delete anything in it.
            </>,
            <>
              Add a <strong>fellow manager</strong> and they get the project on their side too,
              with the same control you have.
            </>,
            <>
              Remove someone from the project and it disappears from their side immediately.
            </>,
            <>
              Managers who are <em>not</em> on the project see nothing at all — not the name, not
              the task count, nothing.
            </>,
          ]}
        />

        <H>Creating a project</H>
        <Steps
          items={[
            <>
              <strong>Projects → New Project.</strong> Give it a name, and a logo if you like.
            </>,
            <>
              Pick the <strong>organization</strong> it belongs to. As Admin you may pick any; a
              Manager picks from their own. Everything below re-filters to that organization.
            </>,
            <>
              Choose <strong>project managers</strong> (fellow managers who will co-run it) and{" "}
              <strong>assigned members</strong> (the people doing the work).
            </>,
            <>
              Set the start and tentative end dates, then create. Everyone you assigned gets an
              email and an in-app notification.
            </>,
          ]}
        />

        <H>Changing the roster later</H>
        <P>
          Open the project and click <strong>Edit</strong>. The same pickers appear. Newly added
          people are notified; removed people lose access at once. Only the Admin can move a
          project to a different organization.
        </P>
      </div>
    ),
  },
  {
    id: "users",
    title: "People and accounts",
    icon: Users,
    summary: "Creating users, switching into accounts, and what a Manager may touch.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Creating a user</H>
        <P>
          <strong>Settings → Users → Add user.</strong> You set their name, email (which is also
          their username) and an initial password. As Admin you also choose their role — Manager
          or Member — and <strong>which organizations they join</strong>, right there in the
          create form.
        </P>
        <Callout tone="warn" title="Always give them an organization">
          A user who belongs to no organization can&apos;t be staffed onto any project and
          won&apos;t appear in anybody&apos;s people picker. The Add user form insists on at
          least one for that reason, and the Users list flags anyone in that state with{" "}
          <em>None — can&apos;t be staffed</em>.
        </Callout>
        <P>
          A Manager can only ever create Members, and those Members automatically join the
          Manager&apos;s own organizations — so a Manager never has to think about organizations
          at all.
        </P>

        <H>Editing a user</H>
        <P>
          <strong>Edit</strong> in the Actions column of Settings → Users. As Admin you can change
          every field on the account:
        </P>
        <Bullets
          items={[
            <>
              <strong>Profile picture</strong> — upload an image; it shows in the Users list and
              anywhere the person appears.
            </>,
            <>
              <strong>Full name</strong> — the display name used everywhere in the app.
            </>,
            <>
              <strong>Email</strong> — this is what they sign in with, so tell them before you
              change it.
            </>,
            <>
              <strong>Role</strong> — promote a Member to Manager, or demote. You can&apos;t
              demote the last remaining Admin; the app blocks it, because there would be nobody
              left who can create organizations or approve requests.
            </>,
            <>
              <strong>Organizations</strong> — move someone between companies, or put them in
              several. Removing every organization makes them invisible in all staffing pickers,
              and the dialog warns you when you&apos;re about to do that.
            </>,
            <>
              <strong>New password</strong> — optional. Leave it blank to keep the current one.
            </>,
          ]}
        />
        <P>
          A Manager sees the same <strong>Edit</strong> button but a much shorter form: the name
          and picture of a Member in one of their own organizations, and nothing else. They
          cannot change anyone&apos;s email, role, organizations or password, and cannot edit a
          fellow Manager at all.
        </P>

        <H>Switching into an account (&ldquo;Switch to&rdquo;)</H>
        <P>
          This signs you into the other person&apos;s account for real, so you see precisely what
          they see. A coloured banner stays across the top of the screen the whole time; click{" "}
          <strong>Exit</strong> to come back to yourself.
        </P>
        <Bullets
          items={[
            <>
              <strong>Nobody</strong> can switch into an Admin account.
            </>,
            <>
              A <strong>Manager</strong> can switch only into a <strong>Member</strong> of one of
              their own organizations — never into a fellow manager.
            </>,
            <>
              Every switch is recorded, with who switched into whom and when.
            </>,
            <>
              While switched in you also see that person&apos;s activity log and notifications —
              this is how you review an account&apos;s work as Admin.
            </>,
          ]}
        />

        <H>Passwords</H>
        <P>
          Passwords are stored encrypted so that you, as Admin, can reveal or reset any
          user&apos;s password from Settings → Users. Users cannot change their own password
          directly: they file a request that appears under{" "}
          <strong>Settings → Password Requests</strong> for you to approve or reject.
        </P>
      </div>
    ),
  },
  {
    id: "dashboard",
    title: "The dashboard",
    icon: LayoutDashboard,
    summary: "Your bird's-eye view — what every tile and chart is telling you.",
    body: (
      <div className="flex flex-col gap-4">
        <P>
          The dashboard shows the same widgets to everyone; only the scope differs. The Admin sees
          the whole workspace, a Manager sees their assigned projects, a Member sees theirs.
        </P>

        <H>The four tiles across the top</H>
        <Bullets
          items={[
            <>
              <strong>Projects</strong> — how many you&apos;re on, and the total task count across
              them.
            </>,
            <>
              <strong>Completed</strong> — the percentage of all tasks sitting in the Done status.
              Turns green past 75%.
            </>,
            <>
              <strong>Due this week</strong> — unfinished tasks with a due date in the next seven
              days. This is what&apos;s about to land.
            </>,
            <>
              <strong>Overdue</strong> — past their due date and still not Done, with a note of how
              many are yours. Drive this to zero.
            </>,
          ]}
        />

        <H>The panels below</H>
        <Bullets
          items={[
            <>
              <strong>My tasks</strong> — everything assigned to you that isn&apos;t finished, most
              urgent first. The coloured dot is priority. Click any row to open the task.
            </>,
            <>
              <strong>Where the work stands</strong> — every task grouped by status, using the
              exact colours set in Settings → Statuses.
            </>,
            <>
              <strong>Open work by priority</strong> — how much high / medium / low work is still
              outstanding. A lot of red means the team is firefighting.
            </>,
            <>
              <strong>Last 14 days</strong> — tasks created against tasks completed, day by day.
              When the dashed &ldquo;created&rdquo; line runs above the solid &ldquo;completed&rdquo; line, the backlog
              is growing.
            </>,
            <>
              <strong>Who&apos;s carrying what</strong> — open tasks per person, busiest first. The
              red part of each bar is already overdue.
            </>,
            <>
              <strong>Projects</strong> — every project you&apos;re on, most-at-risk first, with a
              completion bar and an overdue count.
            </>,
            <>
              <strong>Recent activity</strong> — the latest things that happened. Click through to
              the task.
            </>,
          ]}
        />

        <H>The per-project dashboard</H>
        <P>
          Every project also has its own <strong>Dashboard</strong> tab next to Table and Kanban,
          which breaks the same numbers down by category and assignee for that project alone.
        </P>
      </div>
    ),
  },
  {
    id: "tasks",
    title: "Working with tasks",
    icon: ListChecks,
    summary: "The table, the Kanban board, and everything inside a task.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Three ways to look at a project</H>
        <Bullets
          items={[
            <>
              <strong>Table</strong> — the default. Tasks grouped under their categories, with
              inline editing of priority, status and due date. Search, filter and choose which
              columns show.
            </>,
            <>
              <strong>Kanban</strong> — the same tasks as cards in status columns. Drag a card to
              a different column to change its status.
            </>,
            <>
              <strong>Dashboard</strong> — charts for this project alone.
            </>,
          ]}
        />

        <H>Adding work</H>
        <Steps
          items={[
            <>
              Add a <strong>category</strong> first if you want the tasks grouped — otherwise
              they land under &ldquo;Uncategorized&rdquo;.
            </>,
            <>Type a task name in the row at the bottom of a category and press Enter.</>,
            <>
              Click the task name to open its drawer, where you set the description, assignee, due
              date, priority, status and repeat schedule.
            </>,
          ]}
        />

        <H>Inside a task</H>
        <Bullets
          items={[
            <>
              <strong>Details</strong> — name, description, priority, status, due date, assignee,
              recurrence, and the comment thread.
            </>,
            <>
              <strong>Checklist</strong> — sub-steps you tick off. Handy for a task with several
              parts that doesn&apos;t deserve its own category.
            </>,
            <>
              <strong>Links</strong> — labels for cross-cutting tags, plus dependencies. A task
              that depends on an unfinished task is flagged <em>Blocked</em>.
            </>,
            <>
              <strong>Time</strong> — an estimate and a log of time actually spent.
            </>,
          ]}
        />

        <H>Recurring tasks</H>
        <P>
          Set a task to repeat daily, weekly or monthly and the next occurrence is created
          automatically the moment you mark the current one Done, with the due date rolled
          forward.
        </P>

        <H>Bulk edits</H>
        <P>
          Tick several tasks in the table and a bar appears letting you change their status or
          priority together, or delete them in one go.
        </P>
      </div>
    ),
  },
  {
    id: "statuses",
    title: "Statuses and priority",
    icon: Workflow,
    summary: "The workflow columns are yours to configure. Priority is fixed at three levels.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Statuses</H>
        <P>
          Statuses are the columns of your workflow, and the Admin configures them in{" "}
          <strong>Settings → Statuses</strong>. Each has a label, a colour and a position. Out of
          the box: Not Started, Started, In Progress, Pending, Pending Approval, Waiting for
          Feedback, Feedback Asked, Done.
        </P>
        <Callout tone="warn" title="Two labels are special">
          <p>
            <strong>&ldquo;Done&rdquo;</strong> is what every completion figure counts, what closes a
            recurring task, and what stops a task being called overdue. Renaming it will make the
            dashboards read zero.
          </p>
          <p className="mt-1">
            <strong>&ldquo;Waiting for Feedback&rdquo;</strong> and <strong>&ldquo;Feedback Asked&rdquo;</strong> send an
            email to the project&apos;s manager when a task moves into them.
          </p>
        </Callout>
        <P>
          Whatever colour you give a status is the colour it wears everywhere — the table chips,
          the Kanban columns, the dashboard breakdown, and the Status column of the PDF report.
        </P>

        <H>Priority</H>
        <P>
          Three fixed levels — High (red), Medium (amber), Low (green). Priority is deliberately
          not configurable: it exists to sort, and three levels sort better than seven.
        </P>
      </div>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    summary: "What triggers one, where they appear, and how they stay unread until opened.",
    body: (
      <div className="flex flex-col gap-4">
        <H>What creates a notification</H>
        <Bullets
          items={[
            <>
              <strong>Someone comments on a task</strong> — the assignee, whoever created the task
              and the project&apos;s managers are all told. This is the feedback loop: a manager
              leaving a note reaches the person who has to act on it.
            </>,
            <>
              <strong>A task is assigned</strong> — the new assignee and the project&apos;s
              managers.
            </>,
            <>
              <strong>A status moves to Done, Waiting for Feedback or Feedback Asked</strong> — the
              project&apos;s managers and the assignee.
            </>,
            <>
              <strong>You&apos;re added to a project</strong> — you get both an in-app notification
              and an email.
            </>,
            <>
              <strong>Tasks are imported</strong> — everyone on the project.
            </>,
          ]}
        />

        <H>Where they show up</H>
        <P>
          A bell in the top bar carries the unread count and updates live — you don&apos;t need to
          refresh. The <strong>Notifications</strong> item in the sidebar carries the same badge.
          Opening the page gives you <strong>Unread</strong> and <strong>All</strong>.
        </P>

        <Callout tone="info" title="Clicking takes you to the exact task">
          A notification about a comment opens that task&apos;s drawer directly, not just the
          project. Use <strong>Back</strong> in the top bar to return to your notification list.
        </Callout>

        <H>They stay unread until you open them</H>
        <P>
          Nothing is marked read just because it scrolled past. A notification clears when you
          click it, or when you use <strong>Mark all read</strong>. That keeps the tab an actual
          to-do list rather than a log.
        </P>
      </div>
    ),
  },
  {
    id: "admin-notifications",
    title: "The Admin's project board",
    icon: Bell,
    summary: "One column per project — the Admin's cross-workspace view of everything happening.",
    body: (
      <div className="flex flex-col gap-4">
        <P>
          The Admin&apos;s Notifications page has two tabs. <strong>My notifications</strong> is
          the ordinary personal list — you get entries there whenever you&apos;re the assignee on
          a task, same as anyone else. <strong>Project board</strong> is the one built for you.
        </P>

        <H>How the board works</H>
        <Bullets
          items={[
            <>
              One column per project, including the quiet ones — so a glance tells you which
              companies are moving and which have gone silent.
            </>,
            <>
              Each column lists that project&apos;s activity newest first: comments, assignments,
              status moves, imports and staffing changes.
            </>,
            <>Click a card to expand it and read the full detail.</>,
            <>
              Expanded cards have <strong>Open the task</strong>, which takes you straight into the
              task the entry refers to.
            </>,
            <>
              Each column header shows an unread count with a tick to clear the whole column;
              individual cards have <strong>Mark read</strong>.
            </>,
            <>
              Search across every column at once, or tick <strong>Unread only</strong> to hide
              what you&apos;ve dealt with.
            </>,
          ]}
        />

        <Callout tone="info" title="Why a board rather than a list">
          You can&apos;t switch into your own account to read a manager&apos;s notification tab,
          and a single flat list of everyone&apos;s notifications would be mostly duplicates. The
          board groups by project instead, which is how you actually think about the work.
        </Callout>
      </div>
    ),
  },
  {
    id: "audit",
    title: "The activity log",
    icon: Activity,
    summary: "Each person's private record of their own work. Managers cannot read it.",
    body: (
      <div className="flex flex-col gap-4">
        <Callout tone="good" title="Who can read whose">
          <p>
            <strong>You can read your own.</strong> Always, under Settings → My Activity.
          </p>
          <p className="mt-1">
            <strong>Your manager cannot read yours.</strong> Deliberately. This is a record of your
            work, not a supervision tool.
          </p>
          <p className="mt-1">
            <strong>The Admin can read anyone&apos;s.</strong> Either by picking a person from the
            dropdown on that tab, or by switching into their account.
          </p>
        </Callout>

        <H>What gets recorded</H>
        <Bullets
          items={[
            <>Tasks created, edited, reassigned, moved to a new status, and deleted.</>,
            <>Comments written and deleted.</>,
            <>Categories created and deleted.</>,
            <>Projects created, edited, cloned and deleted.</>,
            <>Files imported, with how many rows landed.</>,
            <>Time logged and checklist items ticked.</>,
            <>Account actions — users created or deleted, passwords changed, accounts switched into.</>,
          ]}
        />

        <H>Reading it</H>
        <P>
          Entries are newest-first with a timestamp, the thing acted on and the project it was in.
          Each is colour-coded — green for things created, blue for things changed, red for things
          deleted, violet for account and admin actions — and you can filter to just one of those
          groups or search the text.
        </P>

        <P>
          Entries are written by the server, not the browser, so they can&apos;t be forged or
          quietly suppressed.
        </P>
      </div>
    ),
  },
  {
    id: "import-history",
    title: "Importing, and the import history",
    icon: FileUp,
    summary: "Bring in CSV/Excel data, then trace any task back to the file it came from.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Importing into a project</H>
        <Steps
          items={[
            <>
              Open the project and click <strong>Import</strong>. Drop in a CSV, Excel or JSON
              file.
            </>,
            <>
              Map each column of your file to a field — task name is the only one that&apos;s
              required.
            </>,
            <>
              Choose whether categories come from a column in the file, or everything lands in one
              category you pick.
            </>,
            <>
              Review the preview and confirm. Anything the importer couldn&apos;t make sense of —
              an unknown status, an unparseable date — is reported as a warning rather than
              silently dropped.
            </>,
          ]}
        />
        <P>
          There&apos;s also a <strong>global import</strong> on the dashboard, which lets you pick
          (or create) the destination project first and is the quicker route when you&apos;re
          loading several companies&apos; data in one sitting.
        </P>

        <H>The import history</H>
        <P>
          Every import is recorded. <strong>Settings → Import History</strong> lists them all with
          the file name, the exact date and time, who ran it, which project it went into, how many
          tasks it created, and any warnings it produced. Search by file, project or person.
        </P>

        <H>Seeing just one import&apos;s tasks</H>
        <P>
          Every task remembers the import it arrived in. Two ways to use that:
        </P>
        <Bullets
          items={[
            <>
              From the history, click <strong>View tasks</strong> on any row — it opens the project
              with the table already filtered to that import alone.
            </>,
            <>
              Inside a project, open <strong>Filter → Imported batch</strong> and pick a file. A
              chip appears above the table showing which import you&apos;re looking at; click its ×
              to see everything again.
            </>,
          ]}
        />
        <Callout tone="warn" title="If an import goes wrong">
          Filter the table to that batch, select all, and bulk-delete — that removes exactly what
          the file brought in and nothing else.
        </Callout>
      </div>
    ),
  },
  {
    id: "reports",
    title: "Reports and exports",
    icon: Download,
    summary: "PDF, Excel and JSON — what each is for and what's in the PDF.",
    body: (
      <div className="flex flex-col gap-4">
        <P>
          The <strong>Download</strong> button in a project offers three formats.
        </P>

        <H>PDF — the report you hand to someone</H>
        <Bullets
          items={[
            <>
              <strong>One section per category</strong>, each with its own heading and a
              &ldquo;12 tasks · 5 done&rdquo; summary line, rather than one long flat list.
            </>,
            <>
              <strong>Colour-coded Priority</strong> — red for High, amber for Medium, green for
              Low.
            </>,
            <>
              <strong>Colour-coded Status</strong>, using the exact colours you configured in
              Settings → Statuses.
            </>,
            <>
              <strong>Overdue dates in red</strong>, so they stand out on paper.
            </>,
            <>
              <strong>Your name on it.</strong> The header and the footer of every page say who
              generated the report and when — so if Chris runs it from their account, the report
              says &ldquo;Generated by Chris&rdquo;.
            </>,
            <>A summary strip up top: total tasks, how many are done, and the high-priority count.</>,
          ]}
        />

        <H>Excel</H>
        <P>
          A flat spreadsheet of the same rows, for when someone wants to pivot or re-sort it
          themselves.
        </P>

        <H>JSON — the full backup</H>
        <P>
          Everything the project contains, including checklists, labels, comments and time logs
          that the other two formats leave out. This is the one to keep as a backup; it can be
          imported back in.
        </P>
      </div>
    ),
  },
  {
    id: "requests",
    title: "Delete and password requests",
    icon: Trash2,
    summary: "How members ask for something they can't do themselves.",
    body: (
      <div className="flex flex-col gap-4">
        <H>Delete requests</H>
        <P>
          Members can&apos;t delete tasks or projects. When they try, the button says{" "}
          <strong>Request delete</strong> and it files a request instead. Nothing is removed until
          the Admin approves it in <strong>Settings → Delete Requests</strong>, where you see what
          was requested, by whom, and in which project. Approving a project deletion removes the
          project and everything in it.
        </P>

        <H>Password requests</H>
        <P>
          A user changing their own password files a request rather than applying it. The Admin
          reviews it under <strong>Settings → Password Requests</strong>, can reveal the proposed
          password before deciding, and approving applies it to the account immediately.
        </P>
      </div>
    ),
  },
  {
    id: "navigation",
    title: "Getting around",
    icon: Search,
    summary: "The back button, favourites, search, and the ? markers.",
    body: (
      <div className="flex flex-col gap-4">
        <H>The Back button</H>
        <P>
          Top-left of every page. It retraces the path you actually took rather than guessing a
          parent page — so arriving at a task from a notification and pressing Back returns you to
          your notifications, not to the project list. It hides itself when there&apos;s nowhere to
          go back to.
        </P>

        <H>Favourites</H>
        <P>
          Star a project from the projects grid and it pins itself to the sidebar under
          Favourites, one click away from anywhere.
        </P>

        <H>Search and filters inside a project</H>
        <P>
          The search box matches task names, descriptions, numbers, priorities, statuses and
          dates. The Filter menu narrows by priority, status and import batch, and your choices are
          remembered per project. The Columns menu hides columns you don&apos;t need.
        </P>

        <H>The ? markers</H>
        <P>
          The small <strong>?</strong> next to a heading or field explains it in a sentence or two,
          and links to the section of this handbook that covers it properly. They&apos;re on the
          dashboard tiles, the project pickers, the filters, the settings tabs and the notification
          board.
        </P>
      </div>
    ),
  },
  {
    id: "settings",
    title: "Settings, tab by tab",
    icon: KeyRound,
    summary: "Which tabs you see and what each one does.",
    body: (
      <div className="flex flex-col gap-4">
        <Bullets
          items={[
            <>
              <strong>Profile</strong> (everyone) — your display name, and the request form for
              changing your password.
            </>,
            <>
              <strong>Organizations</strong> (Admin) — create companies, give them a logo, and
              decide who belongs to each.
            </>,
            <>
              <strong>Users</strong> (Admin, Manager) — the people you can see, their roles, their
              organizations, the Switch-to control, and <strong>Edit</strong> for changing any
              field on an account. Admins additionally get password reveal and reset.
            </>,
            <>
              <strong>My Activity</strong> (everyone) — your own activity log. The Admin gets a
              dropdown here to read anyone&apos;s.
            </>,
            <>
              <strong>Import History</strong> (Admin, Manager) — every import ever run, with a link
              through to the tasks each one created.
            </>,
            <>
              <strong>Statuses</strong> (Admin) — the workflow columns, their labels and colours.
            </>,
            <>
              <strong>Delete Requests</strong> (Admin) — approve or reject member-requested
              deletions.
            </>,
            <>
              <strong>Password Requests</strong> (Admin) — approve or reject password changes.
            </>,
            <>
              <strong>Meeting Links</strong> (everyone; Admins and Managers can edit) — shared
              links to recurring calls.
            </>,
          ]}
        />
      </div>
    ),
  },
  {
    id: "priority",
    title: "Quick answers",
    icon: Lock,
    summary: "The questions that come up most often.",
    body: (
      <div className="flex flex-col gap-4">
        <H>&ldquo;A manager says they can&apos;t see a project.&rdquo;</H>
        <P>
          They haven&apos;t been assigned to it. Open the project → Edit → add them under{" "}
          <strong>Project managers</strong>. There is no organization-wide or role-wide visibility
          any more.
        </P>

        <H>&ldquo;A manager can&apos;t find a person in the picker.&rdquo;</H>
        <P>
          That person isn&apos;t in the manager&apos;s organization. Settings → Organizations →
          People, and add them.
        </P>

        <H>&ldquo;Someone shows &lsquo;None — can&apos;t be staffed&rsquo; in the Users list.&rdquo;</H>
        <P>
          They belong to no organization, so nobody can put them on a project. Settings → Users →
          <strong> Edit</strong> → add them to one.
        </P>

        <H>&ldquo;I need to move someone to a different company.&rdquo;</H>
        <P>
          Settings → Users → <strong>Edit</strong> → change their Organizations. Note this only
          changes who can <em>see</em> them; any project they&apos;re already assigned to stays
          assigned. Remove them from those projects separately if that&apos;s what you meant.
        </P>

        <H>&ldquo;Someone changed their name / needs a different login email.&rdquo;</H>
        <P>
          Settings → Users → <strong>Edit</strong>. Both are editable by the Admin. Changing the
          email changes what they sign in with, so warn them first.
        </P>

        <H>&ldquo;The completion percentage is stuck at 0%.&rdquo;</H>
        <P>
          Something renamed the <strong>Done</strong> status. Every completion figure looks for
          that exact label. Rename it back in Settings → Statuses.
        </P>

        <H>&ldquo;Can a manager see what a member has been doing?&rdquo;</H>
        <P>
          Not through the activity log — that&apos;s private to the account holder and the Admin.
          What a manager <em>can</em> see is the work itself: the tasks, their statuses, the
          comments and the time logged in the projects they share.
        </P>

        <H>&ldquo;I deleted an import by mistake — is the data gone?&rdquo;</H>
        <P>
          Deleting an import batch record doesn&apos;t delete its tasks. Deleting the tasks
          themselves is what removes them, and for members that goes through a delete request you
          have to approve first.
        </P>
      </div>
    ),
  },
];

// ── The page shell ────────────────────────────────────────────────────────

export function HandbookContent() {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => (s.title + " " + s.summary + " " + s.id).toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
      {/* Contents rail */}
      <aside className="lg:sticky lg:top-20 lg:h-fit lg:w-64 lg:shrink-0">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a topic…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <nav className="flex flex-col gap-0.5">
          {visible.map((section) => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{section.title}</span>
              </a>
            );
          })}
          {visible.length === 0 && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No topic matches that.</p>
          )}
        </nav>
      </aside>

      {/* Sections */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {visible.map((section) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.id}
              id={section.id}
              // scroll-mt clears the sticky header when a "?" jumps here.
              className="scroll-mt-20 gap-4 rounded-2xl p-6 shadow-sm"
            >
              <header className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
                  <p className="text-sm text-muted-foreground">{section.summary}</p>
                </div>
              </header>
              <div className="flex flex-col gap-3">{section.body}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
