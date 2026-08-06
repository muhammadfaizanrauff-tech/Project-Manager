import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DashboardProject = {
  id: string;
  name: string;
  organizationName: string | null;
  memberCount: number;
  taskTotal: number;
  taskDone: number;
  taskOverdue: number;
  /** Soonest unfinished due date, so a project can be sorted by urgency. */
  nextDue: string | null;
};

export type StatusSlice = { label: string; color: string; count: number };

export type MyTask = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  statusLabel: string | null;
  statusColor: string | null;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
  /** overdue → due today → due this week → later */
  bucket: "overdue" | "today" | "week" | "later" | "none";
};

export type DashboardData = {
  totalProjects: number;
  totalTasks: number;
  totalDone: number;
  totalOverdue: number;
  totalOpen: number;
  dueThisWeek: number;
  /** Tasks assigned to the signed-in user and not yet Done. */
  myOpenTasks: number;
  myOverdueTasks: number;
  projects: DashboardProject[];
  statusBreakdown: StatusSlice[];
  priorityBreakdown: { priority: "high" | "medium" | "low"; count: number }[];
  workload: { userId: string; name: string; openTasks: number; overdue: number }[];
  myTasks: MyTask[];
  /** Tasks completed per day over the last 14 days. */
  completionTrend: { date: string; completed: number; created: number }[];
  recentActivity: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    projectId: string;
    projectName: string;
    taskId: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};

const DAY_MS = 86_400_000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketFor(dueDate: string | null, isDone: boolean): MyTask["bucket"] {
  if (!dueDate || isDone) return "none";
  const today = startOfToday();
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  if (due.getTime() <= today.getTime() + 7 * DAY_MS) return "week";
  return "later";
}

/**
 * Everything the dashboard needs, in one pass.
 *
 * Scoped entirely by RLS: an Admin's query returns the whole workspace, a
 * Manager's returns their assigned projects, a Member's returns theirs. The
 * shape is identical for all three, so one dashboard component serves
 * everyone — the numbers just describe a different slice.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: projects },
    { data: tasks },
    { data: statuses },
    { data: profiles },
    { data: memberRows },
    { data: orgs },
    { data: events },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, organization_id"),
    supabase
      .from("tasks")
      .select("id, name, project_id, status_id, due_date, assignee_id, priority, created_at, updated_at"),
    supabase.from("statuses").select("id, label, color, position").order("position"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("project_members").select("project_id"),
    supabase.from("organizations").select("id, name"),
    supabase
      .from("project_events")
      .select("id, type, title, body, project_id, task_id, created_at, actor:actor_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const statusById = new Map((statuses ?? []).map((s) => [s.id, s]));
  const doneStatusIds = new Set(
    (statuses ?? []).filter((s) => s.label === "Done").map((s) => s.id),
  );
  const isDone = (statusId: string | null) => Boolean(statusId && doneStatusIds.has(statusId));

  const today = startOfToday();
  const weekAhead = new Date(today.getTime() + 7 * DAY_MS);

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCounts.set(row.project_id, (memberCounts.get(row.project_id) ?? 0) + 1);
  }

  const allTasks = tasks ?? [];
  const isOverdue = (t: (typeof allTasks)[number]) =>
    Boolean(t.due_date) && new Date(t.due_date!) < today && !isDone(t.status_id);

  // ── Per-project rollup ────────────────────────────────────────────────
  const projectSummaries: DashboardProject[] = (projects ?? []).map((p) => {
    const projectTasks = allTasks.filter((t) => t.project_id === p.id);
    const open = projectTasks.filter((t) => !isDone(t.status_id));
    const upcoming = open
      .map((t) => t.due_date)
      .filter((d): d is string => Boolean(d))
      .sort();

    return {
      id: p.id,
      name: p.name,
      organizationName: p.organization_id ? orgNameById.get(p.organization_id) ?? null : null,
      memberCount: memberCounts.get(p.id) ?? 0,
      taskTotal: projectTasks.length,
      taskDone: projectTasks.filter((t) => isDone(t.status_id)).length,
      taskOverdue: projectTasks.filter(isOverdue).length,
      nextDue: upcoming[0] ?? null,
    };
  });

  // ── Status and priority breakdowns ────────────────────────────────────
  const statusCounts = new Map<string, number>();
  for (const task of allTasks) {
    const key = task.status_id ?? "__unset__";
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const statusBreakdown: StatusSlice[] = (statuses ?? [])
    .map((s) => ({ label: s.label, color: s.color, count: statusCounts.get(s.id) ?? 0 }))
    .filter((s) => s.count > 0);
  const unsetCount = statusCounts.get("__unset__") ?? 0;
  if (unsetCount > 0) {
    statusBreakdown.push({ label: "No status", color: "#cbd5e1", count: unsetCount });
  }

  const priorityBreakdown = (["high", "medium", "low"] as const).map((priority) => ({
    priority,
    count: allTasks.filter((t) => t.priority === priority && !isDone(t.status_id)).length,
  }));

  // ── Workload per person ───────────────────────────────────────────────
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Unnamed"]));
  const workloadMap = new Map<string, { openTasks: number; overdue: number }>();
  for (const task of allTasks) {
    if (!task.assignee_id || isDone(task.status_id)) continue;
    const current = workloadMap.get(task.assignee_id) ?? { openTasks: 0, overdue: 0 };
    current.openTasks += 1;
    if (isOverdue(task)) current.overdue += 1;
    workloadMap.set(task.assignee_id, current);
  }
  const workload = Array.from(workloadMap.entries())
    .map(([userId, counts]) => ({
      userId,
      name: nameById.get(userId) ?? "Unknown",
      ...counts,
    }))
    .sort((a, b) => b.openTasks - a.openTasks);

  // ── "My tasks" — what the signed-in person actually has to do ─────────
  const bucketRank = { overdue: 0, today: 1, week: 2, later: 3, none: 4 } as const;
  const myTasks: MyTask[] = allTasks
    .filter((t) => user && t.assignee_id === user.id && !isDone(t.status_id))
    .map((t) => {
      const status = t.status_id ? statusById.get(t.status_id) : undefined;
      return {
        id: t.id,
        name: t.name,
        projectId: t.project_id,
        projectName: projectNameById.get(t.project_id) ?? "Unknown project",
        statusLabel: status?.label ?? null,
        statusColor: status?.color ?? null,
        priority: t.priority as MyTask["priority"],
        dueDate: t.due_date,
        bucket: bucketFor(t.due_date, false),
      };
    })
    .sort(
      (a, b) =>
        bucketRank[a.bucket] - bucketRank[b.bucket] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    )
    .slice(0, 12);

  // ── 14-day trend ──────────────────────────────────────────────────────
  // "Completed" is approximated by updated_at on a Done task: there's no
  // completed_at column, and the last edit to a finished task is
  // overwhelmingly the edit that finished it.
  const completionTrend: DashboardData["completionTrend"] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const nextDay = new Date(day.getTime() + DAY_MS);
    const inDay = (iso: string) => {
      const d = new Date(iso);
      return d >= day && d < nextDay;
    };
    completionTrend.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      completed: allTasks.filter((t) => isDone(t.status_id) && inDay(t.updated_at)).length,
      created: allTasks.filter((t) => inDay(t.created_at)).length,
    });
  }

  const recentActivity = (events ?? []).map((e) => {
    const actor = e.actor as unknown as { full_name: string | null } | null;
    return {
      id: e.id,
      type: e.type,
      title: e.title,
      body: e.body,
      projectId: e.project_id,
      projectName: projectNameById.get(e.project_id) ?? "Unknown project",
      taskId: e.task_id,
      actorName: actor?.full_name ?? null,
      createdAt: e.created_at,
    };
  });

  const totalDone = allTasks.filter((t) => isDone(t.status_id)).length;

  return {
    totalProjects: projects?.length ?? 0,
    totalTasks: allTasks.length,
    totalDone,
    totalOverdue: allTasks.filter(isOverdue).length,
    totalOpen: allTasks.length - totalDone,
    dueThisWeek: allTasks.filter(
      (t) =>
        t.due_date &&
        !isDone(t.status_id) &&
        new Date(t.due_date) >= today &&
        new Date(t.due_date) <= weekAhead,
    ).length,
    myOpenTasks: allTasks.filter((t) => user && t.assignee_id === user.id && !isDone(t.status_id))
      .length,
    myOverdueTasks: allTasks.filter(
      (t) => user && t.assignee_id === user.id && isOverdue(t),
    ).length,
    projects: projectSummaries.sort((a, b) => b.taskOverdue - a.taskOverdue || b.taskTotal - a.taskTotal),
    statusBreakdown,
    priorityBreakdown,
    workload,
    myTasks,
    completionTrend,
    recentActivity,
  };
}
