import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Subtask = {
  id: string;
  task_id: string;
  name: string;
  is_done: boolean;
  position: number;
};

export type Label = {
  id: string;
  project_id: string;
  name: string;
  color: string;
};

export type TimeLog = {
  id: string;
  task_id: string;
  user_id: string | null;
  minutes: number;
  note: string | null;
  logged_at: string;
  user: { full_name: string | null } | null;
};

export type DependencyRef = { id: string; name: string; serial_no: number };

export type TaskExtras = {
  subtasks: Subtask[];
  labels: Label[];
  taskLabelIds: string[];
  dependsOn: DependencyRef[];
  blocks: DependencyRef[];
  timeLogs: TimeLog[];
};

export async function getTaskExtras(taskId: string): Promise<TaskExtras> {
  const supabase = await createClient();

  const [subtasksRes, taskLabelsRes, dependsOnRes, blocksRes, timeLogsRes] =
    await Promise.all([
      supabase
        .from("subtasks")
        .select("id, task_id, name, is_done, position")
        .eq("task_id", taskId)
        .order("position"),
      supabase.from("task_labels").select("label_id").eq("task_id", taskId),
      supabase
        .from("task_dependencies")
        .select("depends_on:depends_on_task_id(id, name, serial_no)")
        .eq("task_id", taskId),
      supabase
        .from("task_dependencies")
        .select("blocked:task_id(id, name, serial_no)")
        .eq("depends_on_task_id", taskId),
      supabase
        .from("time_logs")
        .select("id, task_id, user_id, minutes, note, logged_at, user:user_id(full_name)")
        .eq("task_id", taskId)
        .order("logged_at", { ascending: false }),
    ]);

  return {
    subtasks: subtasksRes.data ?? [],
    labels: [],
    taskLabelIds: (taskLabelsRes.data ?? []).map((r) => r.label_id),
    dependsOn: (dependsOnRes.data ?? []).map(
      (r) => r.depends_on as unknown as DependencyRef,
    ),
    blocks: (blocksRes.data ?? []).map((r) => r.blocked as unknown as DependencyRef),
    timeLogs: (timeLogsRes.data ?? []).map((r) => ({
      ...r,
      user: r.user as unknown as { full_name: string | null } | null,
    })),
  };
}

export async function listProjectLabels(projectId: string): Promise<Label[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("labels")
    .select("id, project_id, name, color")
    .eq("project_id", projectId)
    .order("name");
  return data ?? [];
}
