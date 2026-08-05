"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function client() {
  return createClient();
}

async function currentUserId() {
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Subtasks ──────────────────────────────────────────────────────────────
export async function addSubtask(projectId: string, taskId: string, name: string) {
  const supabase = await client();
  const { count } = await supabase
    .from("subtasks")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);

  const { data, error } = await supabase
    .from("subtasks")
    .insert({ task_id: taskId, name, position: count ?? 0 })
    .select("id, task_id, name, is_done, position")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function toggleSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  isDone: boolean,
) {
  const supabase = await client();
  const { error } = await supabase
    .from("subtasks")
    .update({ is_done: isDone })
    .eq("id", subtaskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteSubtask(projectId: string, taskId: string, subtaskId: string) {
  const supabase = await client();
  const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ── Dependencies ────────────────────────────────────────────────────────
export async function addDependency(
  projectId: string,
  taskId: string,
  dependsOnTaskId: string,
) {
  const supabase = await client();
  const { error } = await supabase
    .from("task_dependencies")
    .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function removeDependency(
  projectId: string,
  taskId: string,
  dependsOnTaskId: string,
) {
  const supabase = await client();
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ── Labels ──────────────────────────────────────────────────────────────
export async function createLabel(projectId: string, name: string, color: string) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("labels")
    .insert({ project_id: projectId, name, color })
    .select("id, project_id, name, color")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function deleteLabel(projectId: string, labelId: string) {
  const supabase = await client();
  const { error } = await supabase.from("labels").delete().eq("id", labelId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setTaskLabel(
  projectId: string,
  taskId: string,
  labelId: string,
  assign: boolean,
) {
  const supabase = await client();
  if (assign) {
    const { error } = await supabase
      .from("task_labels")
      .insert({ task_id: taskId, label_id: labelId });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("task_labels")
      .delete()
      .eq("task_id", taskId)
      .eq("label_id", labelId);
    if (error) return { error: error.message };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ── Time tracking ───────────────────────────────────────────────────────
export async function logTime(
  projectId: string,
  taskId: string,
  minutes: number,
  note?: string,
) {
  const supabase = await client();
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("time_logs")
    .insert({ task_id: taskId, user_id: userId, minutes, note: note || null })
    .select("id, task_id, user_id, minutes, note, logged_at, user:user_id(full_name)")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function deleteTimeLog(projectId: string, logId: string) {
  const supabase = await client();
  const { error } = await supabase.from("time_logs").delete().eq("id", logId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setEstimate(projectId: string, taskId: string, minutes: number | null) {
  const supabase = await client();
  const { error } = await supabase
    .from("tasks")
    .update({ estimate_minutes: minutes })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setRecurrence(
  projectId: string,
  taskId: string,
  recurrence: "none" | "daily" | "weekly" | "monthly",
) {
  const supabase = await client();
  const { error } = await supabase.from("tasks").update({ recurrence }).eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
