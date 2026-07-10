import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Status = {
  id: string;
  label: string;
  color: string;
  position: number;
};

export type TaskRecord = {
  id: string;
  project_id: string;
  category_id: string | null;
  serial_no: number;
  name: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  status_id: string | null;
  due_date: string | null;
  assignee_id: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  estimate_minutes: number | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
};

export type CategoryRecord = {
  id: string;
  project_id: string;
  name: string;
  position: number;
};

export type CommentRecord = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author: { id: string; full_name: string | null } | null;
};

export type ProjectWorkspaceData = {
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
  members: { id: string; full_name: string | null; role: string }[];
  commentCounts: Record<string, number>;
  labels: { id: string; project_id: string; name: string; color: string }[];
};

export async function getProjectWorkspaceData(
  projectId: string,
): Promise<ProjectWorkspaceData> {
  const supabase = await createClient();

  const [categoriesRes, tasksRes, statusesRes, membersRes, labelsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, project_id, name, position")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(
        "id, project_id, category_id, serial_no, name, description, priority, status_id, due_date, assignee_id, position, created_by, created_at, updated_at, estimate_minutes, recurrence",
      )
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase.from("statuses").select("id, label, color, position").order("position"),
    supabase
      .from("project_members")
      .select("profiles:user_id(id, full_name, role)")
      .eq("project_id", projectId),
    supabase
      .from("labels")
      .select("id, project_id, name, color")
      .eq("project_id", projectId)
      .order("name"),
  ]);

  const taskIds = (tasksRes.data ?? []).map((t) => t.id);
  const commentCounts: Record<string, number> = {};
  if (taskIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("comments")
      .select("task_id")
      .in("task_id", taskIds);
    for (const row of commentRows ?? []) {
      commentCounts[row.task_id] = (commentCounts[row.task_id] ?? 0) + 1;
    }
  }

  return {
    categories: categoriesRes.data ?? [],
    tasks: tasksRes.data ?? [],
    statuses: statusesRes.data ?? [],
    members: (membersRes.data ?? []).map(
      (m) => m.profiles as unknown as { id: string; full_name: string | null; role: string },
    ),
    commentCounts,
    labels: labelsRes.data ?? [],
  };
}

export async function listComments(taskId: string): Promise<CommentRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select("id, task_id, author_id, body, created_at, author:author_id(id, full_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((c) => ({
    ...c,
    author: c.author as unknown as { id: string; full_name: string | null } | null,
  }));
}
