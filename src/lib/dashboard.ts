import "server-only";
import { createClient } from "@/lib/supabase/server";

export type GlobalDashboardData = {
  totalProjects: number;
  totalTasks: number;
  totalDone: number;
  totalOverdue: number;
  projects: {
    id: string;
    name: string;
    memberCount: number;
    taskTotal: number;
    taskDone: number;
  }[];
  workload: { userId: string; name: string; openTasks: number }[];
};

export async function getGlobalDashboardData(): Promise<GlobalDashboardData> {
  const supabase = await createClient();

  const [{ data: projects }, { data: tasks }, { data: statuses }, { data: profiles }] =
    await Promise.all([
      supabase.from("projects").select("id, name"),
      supabase.from("tasks").select("id, project_id, status_id, due_date, assignee_id"),
      supabase.from("statuses").select("id, label"),
      supabase.from("profiles").select("id, full_name, role"),
    ]);

  const doneStatusIds = new Set(
    (statuses ?? []).filter((s) => s.label === "Done").map((s) => s.id),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const memberCounts = new Map<string, number>();
  if (projects && projects.length > 0) {
    const { data: memberRows } = await supabase
      .from("project_members")
      .select("project_id")
      .in("project_id", projects.map((p) => p.id));
    for (const row of memberRows ?? []) {
      memberCounts.set(row.project_id, (memberCounts.get(row.project_id) ?? 0) + 1);
    }
  }

  const projectSummaries = (projects ?? []).map((p) => {
    const projectTasks = (tasks ?? []).filter((t) => t.project_id === p.id);
    const done = projectTasks.filter((t) => t.status_id && doneStatusIds.has(t.status_id)).length;
    return {
      id: p.id,
      name: p.name,
      memberCount: memberCounts.get(p.id) ?? 0,
      taskTotal: projectTasks.length,
      taskDone: done,
    };
  });

  const totalDone = (tasks ?? []).filter(
    (t) => t.status_id && doneStatusIds.has(t.status_id),
  ).length;
  const totalOverdue = (tasks ?? []).filter(
    (t) =>
      t.due_date &&
      new Date(t.due_date) < today &&
      !(t.status_id && doneStatusIds.has(t.status_id)),
  ).length;

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Unnamed"]));
  const workloadCounts = new Map<string, number>();
  for (const task of tasks ?? []) {
    if (!task.assignee_id) continue;
    if (task.status_id && doneStatusIds.has(task.status_id)) continue;
    workloadCounts.set(task.assignee_id, (workloadCounts.get(task.assignee_id) ?? 0) + 1);
  }
  const workload = Array.from(workloadCounts.entries())
    .map(([userId, openTasks]) => ({
      userId,
      name: nameById.get(userId) ?? "Unknown",
      openTasks,
    }))
    .sort((a, b) => b.openTasks - a.openTasks);

  return {
    totalProjects: projects?.length ?? 0,
    totalTasks: tasks?.length ?? 0,
    totalDone,
    totalOverdue,
    projects: projectSummaries,
    workload,
  };
}

export type WorkloadRow = {
  userId: string;
  name: string;
  role: string;
  openTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  projects: { id: string; name: string; count: number }[];
};

export async function getWorkloadData(): Promise<WorkloadRow[]> {
  const supabase = await createClient();

  const [{ data: tasks }, { data: statuses }, { data: profiles }, { data: projects }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, project_id, status_id, due_date, assignee_id, priority"),
      supabase.from("statuses").select("id, label"),
      supabase.from("profiles").select("id, full_name, role"),
      supabase.from("projects").select("id, name"),
    ]);

  const doneStatusIds = new Set(
    (statuses ?? []).filter((s) => s.label === "Done").map((s) => s.id),
  );
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = new Map<string, WorkloadRow>();
  for (const profile of profiles ?? []) {
    rows.set(profile.id, {
      userId: profile.id,
      name: profile.full_name || "Unnamed",
      role: profile.role,
      openTasks: 0,
      overdueTasks: 0,
      highPriorityTasks: 0,
      projects: [],
    });
  }

  const projectCounts = new Map<string, Map<string, number>>();

  for (const task of tasks ?? []) {
    if (!task.assignee_id) continue;
    if (task.status_id && doneStatusIds.has(task.status_id)) continue;
    const row = rows.get(task.assignee_id);
    if (!row) continue;

    row.openTasks += 1;
    if (task.priority === "high") row.highPriorityTasks += 1;
    if (task.due_date && new Date(task.due_date) < today) row.overdueTasks += 1;

    if (!projectCounts.has(task.assignee_id)) projectCounts.set(task.assignee_id, new Map());
    const perProject = projectCounts.get(task.assignee_id)!;
    perProject.set(task.project_id, (perProject.get(task.project_id) ?? 0) + 1);
  }

  for (const [userId, perProject] of projectCounts) {
    const row = rows.get(userId);
    if (!row) continue;
    row.projects = Array.from(perProject.entries()).map(([projectId, count]) => ({
      id: projectId,
      name: projectNameById.get(projectId) ?? "Unknown project",
      count,
    }));
  }

  return Array.from(rows.values())
    .filter((r) => r.role !== "admin")
    .sort((a, b) => b.openTasks - a.openTasks);
}
