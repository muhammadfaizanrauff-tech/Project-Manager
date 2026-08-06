"use client";

import Link from "next/link";
import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  FolderKanban,
  ListTodo,
  MessageSquare,
  Users,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { FadeIn } from "@/components/motion/fade-in";
import { HelpTip } from "@/components/help-tip";
import type { DashboardData, MyTask } from "@/lib/dashboard";

// ── Shared bits ───────────────────────────────────────────────────────────

function Panel({
  title,
  help,
  topic,
  action,
  children,
  className = "",
  delay = 0,
}: {
  title: string;
  help: React.ReactNode;
  topic?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay} y={12} className={className}>
      <Card className="h-full gap-3 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {title}
            <HelpTip topic={topic}>{help}</HelpTip>
          </p>
          {action}
        </div>
        {children}
      </Card>
    </FadeIn>
  );
}

function StatCard({
  label,
  value,
  suffix = "",
  icon: Icon,
  tone = "default",
  hint,
  help,
  topic,
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "success";
  hint?: string;
  help: React.ReactNode;
  topic?: string;
  delay?: number;
}) {
  const accent =
    tone === "warning"
      ? "from-red-500 to-orange-500"
      : tone === "success"
        ? "from-emerald-500 to-teal-500"
        : "from-primary to-accent-foreground/60";
  const iconTone =
    tone === "warning"
      ? "text-red-500"
      : tone === "success"
        ? "text-emerald-500"
        : "text-primary";

  return (
    <FadeIn delay={delay} y={12}>
      <Card className="relative gap-1.5 overflow-hidden rounded-2xl p-5 shadow-sm">
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className={`size-3.5 ${iconTone}`} />
          {label}
          <HelpTip topic={topic}>{help}</HelpTip>
        </div>
        <p className="text-3xl font-semibold tracking-tight">
          <AnimatedNumber value={value} suffix={suffix} />
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </Card>
    </FadeIn>
  );
}

// ── My tasks ──────────────────────────────────────────────────────────────

const BUCKET_STYLES: Record<MyTask["bucket"], { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "text-red-600 dark:text-red-400" },
  today: { label: "Due today", className: "text-amber-600 dark:text-amber-400" },
  week: { label: "This week", className: "text-foreground" },
  later: { label: "Later", className: "text-muted-foreground" },
  none: { label: "No due date", className: "text-muted-foreground" },
};

const PRIORITY_DOT: Record<MyTask["priority"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

function MyTasksPanel({ tasks, delay }: { tasks: MyTask[]; delay: number }) {
  return (
    <Panel
      title="My tasks"
      topic="dashboard"
      help="Everything currently assigned to you that isn't finished, most urgent first. Overdue rises to the top."
      delay={delay}
    >
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing assigned to you right now.
        </p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => {
            const bucket = BUCKET_STYLES[task.bucket];
            return (
              <li key={task.id}>
                <Link
                  href={`/projects/${task.projectId}?task=${task.id}`}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
                    title={`${task.priority} priority`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-primary">
                      {task.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {task.projectName}
                      {task.statusLabel ? ` · ${task.statusLabel}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-medium ${bucket.className}`}>
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : bucket.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── Status breakdown ──────────────────────────────────────────────────────
// One bar per configured status, painted with that status's own colour from
// Settings → Statuses. Colour follows the entity, so editing a status colour
// there changes it here too — there's no second palette to drift out of sync.
// Single series, so no legend: every bar is directly labelled.

function StatusPanel({
  slices,
  total,
  delay,
}: {
  slices: DashboardData["statusBreakdown"];
  total: number;
  delay: number;
}) {
  return (
    <Panel
      title="Where the work stands"
      topic="statuses"
      help="Every task grouped by its workflow status. The colours are the ones set in Settings → Statuses."
      delay={delay}
    >
      {slices.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <>
          {/* A single spectrum bar first: the whole project portfolio at a glance. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {slices.map((s) => (
              <span
                key={s.label}
                // 2px surface gap between adjacent fills keeps the segments
                // legible where two similar colours meet.
                className="h-full border-r-2 border-card last:border-r-0"
                style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>

          <ul className="mt-1 flex flex-col gap-1.5">
            {slices.map((s) => {
              const pct = Math.round((s.count / total) * 100);
              return (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums font-medium">{s.count}</span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ── Priority mix ──────────────────────────────────────────────────────────

const PRIORITY_META = {
  high: { label: "High", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  medium: { label: "Medium", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  low: { label: "Low", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
} as const;

function PriorityPanel({
  breakdown,
  delay,
}: {
  breakdown: DashboardData["priorityBreakdown"];
  delay: number;
}) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <Panel
      title="Open work by priority"
      topic="priority"
      help="Unfinished tasks only. A lot of red means the team is firefighting rather than working through a plan."
      delay={delay}
    >
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {breakdown.map(({ priority, count }) => {
            const meta = PRIORITY_META[priority];
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={priority} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                  {meta.label}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${meta.bar} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className={`w-8 shrink-0 text-right text-sm font-semibold tabular-nums ${meta.text}`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Workload ──────────────────────────────────────────────────────────────

function WorkloadPanel({
  workload,
  delay,
}: {
  workload: DashboardData["workload"];
  delay: number;
}) {
  const top = workload.slice(0, 8);
  const max = Math.max(1, ...top.map((w) => w.openTasks));

  return (
    <Panel
      title="Who's carrying what"
      topic="dashboard"
      help="Open tasks per person, busiest first. The red portion is the part that's already overdue."
      delay={delay}
    >
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing assigned yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {top.map((person) => (
            <div key={person.userId} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={person.name}>
                {person.name}
              </span>
              <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                {person.overdue > 0 && (
                  <span
                    className="h-full border-r-2 border-card bg-red-500"
                    style={{ width: `${(person.overdue / max) * 100}%` }}
                    title={`${person.overdue} overdue`}
                  />
                )}
                <span
                  className="h-full bg-primary"
                  style={{ width: `${((person.openTasks - person.overdue) / max) * 100}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
                {person.openTasks}
              </span>
            </div>
          ))}
          {workload.some((w) => w.overdue > 0) && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full bg-red-500" />
              overdue
              <span className="ml-2 size-2 rounded-full bg-primary" />
              on track
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── 14-day trend ──────────────────────────────────────────────────────────
// Two series, same unit (tasks per day) on one axis — never two y-scales.
// Identity is carried by a legend AND a dashed stroke, so it survives
// colour-blindness and greyscale printing.

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="size-2 rounded-full"
            style={{ background: entry.color }}
            aria-hidden
          />
          {entry.name}
          <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">
            {entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function TrendPanel({
  trend,
  delay,
}: {
  trend: DashboardData["completionTrend"];
  delay: number;
}) {
  const gradientId = useId();
  const hasData = trend.some((d) => d.completed > 0 || d.created > 0);

  return (
    <Panel
      title="Last 14 days"
      topic="dashboard"
      help="Tasks created against tasks completed, day by day. When the created line runs consistently above completed, the backlog is growing."
      delay={delay}
    >
      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No activity in the last two weeks.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden>
                <line x1="0" y1="2" x2="16" y2="2" stroke="var(--chart-1)" strokeWidth="2" />
              </svg>
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden>
                <line
                  x1="0"
                  y1="2"
                  x2="16"
                  y2="2"
                  stroke="var(--chart-2)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>
              Created
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border"
                opacity={0.6}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={34}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="completed"
                name="Completed"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="created"
                name="Created"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Panel>
  );
}

// ── Projects & activity ───────────────────────────────────────────────────

function ProjectsPanel({
  projects,
  delay,
}: {
  projects: DashboardData["projects"];
  delay: number;
}) {
  return (
    <Panel
      title="Projects"
      topic="project-visibility"
      help="Every project you're assigned to, most-at-risk first. The bar is completion; the red pill counts overdue tasks."
      delay={delay}
      action={
        <Link
          href="/projects"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          All projects
          <ArrowRight className="size-3" />
        </Link>
      }
    >
      {projects.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          You&apos;re not assigned to any projects yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {projects.slice(0, 8).map((p) => {
            const pct = p.taskTotal > 0 ? Math.round((p.taskDone / p.taskTotal) * 100) : 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-primary">
                      {p.name}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {p.organizationName && <span className="truncate">{p.organizationName}</span>}
                      <span className="flex shrink-0 items-center gap-0.5">
                        <Users className="size-3" />
                        {p.memberCount}
                      </span>
                      <span className="shrink-0">
                        {p.taskDone}/{p.taskTotal}
                      </span>
                    </span>
                  </span>

                  {p.taskOverdue > 0 && (
                    <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                      {p.taskOverdue} overdue
                    </span>
                  )}

                  <span className="flex w-24 shrink-0 items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  comment: MessageSquare,
  assignment: Users,
  status: CircleDot,
  import: ListTodo,
  project_member: FolderKanban,
};

function ActivityPanel({
  activity,
  delay,
}: {
  activity: DashboardData["recentActivity"];
  delay: number;
}) {
  return (
    <Panel
      title="Recent activity"
      topic="notifications"
      help="The latest things that happened across your projects. Click one to open the task it refers to."
      delay={delay}
      action={
        <Link
          href="/notifications"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          All notifications
          <ArrowRight className="size-3" />
        </Link>
      }
    >
      {activity.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing has happened yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {activity.slice(0, 8).map((event) => {
            const Icon = ACTIVITY_ICONS[event.type] ?? Clock;
            return (
              <li key={event.id}>
                <Link
                  href={
                    event.taskId
                      ? `/projects/${event.projectId}?task=${event.taskId}`
                      : `/projects/${event.projectId}`
                  }
                  className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug group-hover:text-primary">
                      {event.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {event.projectName} ·{" "}
                      {new Date(event.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── The dashboard ─────────────────────────────────────────────────────────

export function GlobalDashboard({ data }: { data: DashboardData }) {
  const completion =
    data.totalTasks > 0 ? Math.round((data.totalDone / data.totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projects"
          value={data.totalProjects}
          icon={FolderKanban}
          hint={`${data.totalTasks} task${data.totalTasks === 1 ? "" : "s"} in total`}
          help="Projects you're assigned to. The Admin sees every project in the workspace."
          topic="project-visibility"
          delay={0}
        />
        <StatCard
          label="Completed"
          value={completion}
          suffix="%"
          icon={CheckCircle2}
          tone={completion >= 75 ? "success" : "default"}
          hint={`${data.totalDone} done · ${data.totalOpen} still open`}
          help="The share of all tasks currently sitting in the Done status."
          topic="statuses"
          delay={0.05}
        />
        <StatCard
          label="Due this week"
          value={data.dueThisWeek}
          icon={CalendarClock}
          hint="Unfinished, due in the next 7 days"
          help="Open tasks with a due date inside the next seven days — what's about to land."
          topic="dashboard"
          delay={0.1}
        />
        <StatCard
          label="Overdue"
          value={data.totalOverdue}
          icon={AlertTriangle}
          tone={data.totalOverdue > 0 ? "warning" : "success"}
          hint={
            data.myOverdueTasks > 0
              ? `${data.myOverdueTasks} of them yours`
              : "None assigned to you"
          }
          help="Tasks past their due date that still aren't Done. This is the number to drive to zero."
          topic="dashboard"
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MyTasksPanel tasks={data.myTasks} delay={0.2} />
        <StatusPanel slices={data.statusBreakdown} total={data.totalTasks} delay={0.25} />
        <PriorityPanel breakdown={data.priorityBreakdown} delay={0.3} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendPanel trend={data.completionTrend} delay={0.35} />
        <WorkloadPanel workload={data.workload} delay={0.4} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProjectsPanel projects={data.projects} delay={0.45} />
        <ActivityPanel activity={data.recentActivity} delay={0.5} />
      </div>
    </div>
  );
}
