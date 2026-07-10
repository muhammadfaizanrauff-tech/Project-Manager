"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  notifyManagerOfAssignment,
  notifyStatusChange,
  notifyTaskAssigned,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

const NOTIFY_STATUS_LABELS = new Set(["Waiting for Feedback", "Feedback Asked"]);

async function client() {
  return createClient();
}

async function currentUserId() {
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function logActivity(taskId: string, action: string, meta?: Record<string, unknown>) {
  const supabase = await client();
  const actorId = await currentUserId();
  await supabase.from("activity_log").insert({
    task_id: taskId,
    actor_id: actorId,
    action,
    meta: meta ?? null,
  });
}

export async function createCategory(projectId: string, name: string) {
  const supabase = await client();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data, error } = await supabase
    .from("categories")
    .insert({ project_id: projectId, name, position: count ?? 0 })
    .select("id, project_id, name, position")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function deleteCategory(projectId: string, categoryId: string) {
  const supabase = await client();
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function createTask(
  projectId: string,
  categoryId: string | null,
  name: string,
) {
  const supabase = await client();

  const { data: user } = await supabase.auth.getUser();

  let position = 0;
  if (categoryId) {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    position = count ?? 0;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      category_id: categoryId,
      name,
      created_by: user.user?.id,
      position,
    })
    .select(
      "id, project_id, category_id, serial_no, name, description, priority, status_id, due_date, assignee_id, position, created_by, created_at, updated_at, estimate_minutes, recurrence",
    )
    .single();

  if (error) return { error: error.message };
  await logActivity(data.id, "created");
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export type TaskPatch = Partial<{
  name: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  status_id: string | null;
  due_date: string | null;
  category_id: string | null;
  position: number;
  assignee_id: string | null;
}>;

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  priority: "priority",
  status_id: "status",
  due_date: "due date",
  category_id: "category",
  assignee_id: "assignee",
};

export async function updateTask(
  projectId: string,
  taskId: string,
  patch: TaskPatch,
) {
  const supabase = await client();

  const { data: before } = await supabase
    .from("tasks")
    .select("name, assignee_id, status_id, recurrence, due_date, category_id, description, priority")
    .eq("id", taskId)
    .single();

  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);

  if (before) {
    for (const key of Object.keys(patch) as Array<keyof TaskPatch>) {
      if (key === "position") continue;
      if (patch[key] !== before[key as keyof typeof before]) {
        void logActivity(taskId, "field_changed", { field: FIELD_LABELS[key] ?? key });
      }
    }
    void handleTaskNotifications(projectId, taskId, before, patch);
    void handleRecurrence(projectId, taskId, before, patch);
  }

  return { ok: true };
}

async function handleTaskNotifications(
  projectId: string,
  taskId: string,
  before: { name: string; assignee_id: string | null; status_id: string | null },
  patch: TaskPatch,
) {
  const supabase = await client();

  const assigneeChanged =
    "assignee_id" in patch && patch.assignee_id && patch.assignee_id !== before.assignee_id;
  const statusChanged = "status_id" in patch && patch.status_id !== before.status_id;

  if (!assigneeChanged && !statusChanged) return;

  const [{ data: project }, { data: assignee }, { data: status }] = await Promise.all([
    supabase.from("projects").select("name, manager_id, created_by").eq("id", projectId).single(),
    assigneeChanged
      ? supabase.from("profiles").select("full_name").eq("id", patch.assignee_id!).maybeSingle()
      : Promise.resolve({ data: null }),
    statusChanged && patch.status_id
      ? supabase.from("statuses").select("label").eq("id", patch.status_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!project) return;
  const taskName = before.name;

  if (assigneeChanged && patch.assignee_id) {
    await notifyTaskAssigned({
      assigneeId: patch.assignee_id,
      taskName,
      projectName: project.name,
      projectId,
    });
    await createNotification({
      userId: patch.assignee_id,
      type: "task_assigned",
      title: `You've been assigned: ${taskName}`,
      body: project.name,
      link: `/projects/${projectId}`,
    });
    const managerId = project.manager_id ?? project.created_by;
    if (managerId && managerId !== patch.assignee_id) {
      await notifyManagerOfAssignment({
        managerId,
        assigneeName: assignee?.full_name ?? "a team member",
        taskName,
        projectName: project.name,
      });
    }
  }

  if (statusChanged && status && NOTIFY_STATUS_LABELS.has(status.label)) {
    const recipientId = project.manager_id ?? project.created_by;
    if (recipientId) {
      await notifyStatusChange({
        recipientId,
        taskName,
        projectName: project.name,
        statusLabel: status.label,
      });
      await createNotification({
        userId: recipientId,
        type: "status_change",
        title: `${status.label}: ${taskName}`,
        body: project.name,
        link: `/projects/${projectId}`,
      });
    }
  }
}

async function handleRecurrence(
  projectId: string,
  taskId: string,
  before: {
    name: string;
    status_id: string | null;
    recurrence: string;
    due_date: string | null;
    category_id: string | null;
    description: string | null;
    priority: string;
  },
  patch: TaskPatch,
) {
  if (!patch.status_id || patch.status_id === before.status_id) return;
  if (!before.recurrence || before.recurrence === "none") return;

  const supabase = await client();
  const { data: status } = await supabase
    .from("statuses")
    .select("label")
    .eq("id", patch.status_id)
    .maybeSingle();
  if (status?.label !== "Done") return;

  const nextDue = new Date(before.due_date ?? new Date().toISOString());
  if (before.recurrence === "daily") nextDue.setDate(nextDue.getDate() + 1);
  else if (before.recurrence === "weekly") nextDue.setDate(nextDue.getDate() + 7);
  else if (before.recurrence === "monthly") nextDue.setMonth(nextDue.getMonth() + 1);

  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("category_id", before.category_id ?? "");

  await supabase.from("tasks").insert({
    project_id: projectId,
    category_id: before.category_id,
    name: before.name,
    description: before.description,
    priority: before.priority,
    due_date: nextDue.toISOString().slice(0, 10),
    recurrence: before.recurrence,
    recurrence_parent_id: taskId,
    position: count ?? 0,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTask(projectId: string, taskId: string) {
  const supabase = await client();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function addComment(projectId: string, taskId: string, body: string) {
  const supabase = await client();
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("comments")
    .insert({ task_id: taskId, author_id: user.user?.id, body })
    .select("id, task_id, author_id, body, created_at, author:author_id(id, full_name)")
    .single();

  if (error) return { error: error.message };
  await logActivity(taskId, "commented");
  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function deleteComment(projectId: string, commentId: string) {
  const supabase = await client();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function bulkUpdateTasks(
  projectId: string,
  taskIds: string[],
  patch: TaskPatch,
) {
  const supabase = await client();
  const { error } = await supabase.from("tasks").update(patch).in("id", taskIds);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function bulkDeleteTasks(projectId: string, taskIds: string[]) {
  const supabase = await client();
  const { error } = await supabase.from("tasks").delete().in("id", taskIds);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
