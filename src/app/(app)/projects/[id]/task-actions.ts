"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import {
  notifyManagerOfAssignment,
  notifyStatusChange,
  notifyTaskAssigned,
} from "@/lib/email";
import { projectLeads, publishEvent } from "@/lib/notifications";

const NOTIFY_STATUS_LABELS = new Set(["Waiting for Feedback", "Feedback Asked"]);

/** The signed-in user's id and display name, for audit and notification copy. */
async function actor() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { id: null, name: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return { id: data.user.id, name: profile?.full_name ?? null };
}

async function client() {
  return createClient();
}

/**
 * Add a category, or hand back the one that's already there.
 *
 * Two categories with the same name in one project is never what anyone meant:
 * it splits a team's tasks across two identical-looking headers. It happened
 * because nothing here was idempotent — a double-click, a retried Server
 * Action, or two people typing the same name at once each inserted a row. The
 * name lookup below makes the common case a no-op, and the unique index in
 * schema-v11.sql closes the race the lookup can't (two inserts in flight at
 * once), which is why a 23505 is treated as success and re-read rather than
 * surfaced as an error.
 */
export async function createCategory(projectId: string, name: string) {
  const supabase = await client();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the category a name." };

  const existing = await findCategoryByName(supabase, projectId, trimmed);
  if (existing) return { data: existing };

  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data, error } = await supabase
    .from("categories")
    .insert({ project_id: projectId, name: trimmed, position: count ?? 0 })
    .select("id, project_id, name, position")
    .single();

  if (error) {
    // 23505 = the unique index fired, so someone else won the race by
    // milliseconds. Their row is the right answer.
    if (error.code === "23505") {
      const winner = await findCategoryByName(supabase, projectId, trimmed);
      if (winner) return { data: winner };
    }
    return { error: error.message };
  }

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "category.create",
    entityType: "category",
    entityId: data.id,
    entityName: trimmed,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`);
  return { data };
}

/** Case-insensitive name lookup within one project. `ilike` with the name
 *  escaped so a category called "50%" doesn't match everything. */
async function findCategoryByName(
  supabase: Awaited<ReturnType<typeof client>>,
  projectId: string,
  name: string,
) {
  const { data } = await supabase
    .from("categories")
    .select("id, project_id, name, position")
    .eq("project_id", projectId)
    .ilike("name", name.replace(/[%_\\]/g, "\\$&"))
    .order("position")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function renameCategory(
  projectId: string,
  categoryId: string,
  name: string,
) {
  const supabase = await client();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the category a name." };

  // Renaming onto a name that already exists would create the very duplicate
  // createCategory now prevents, so it's refused with a sentence rather than a
  // Postgres constraint code.
  const clash = await findCategoryByName(supabase, projectId, trimmed);
  if (clash && clash.id !== categoryId) {
    return { error: `There's already a category called "${clash.name}".` };
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ name: trimmed })
    .eq("id", categoryId)
    .select("id, project_id, name, position")
    .single();

  if (error) return { error: error.message };

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "category.rename",
    entityType: "category",
    entityId: categoryId,
    entityName: trimmed,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`);
  return { data };
}

export async function deleteCategory(projectId: string, categoryId: string) {
  const supabase = await client();
  const { data: existing } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return { error: error.message };

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "category.delete",
    entityType: "category",
    entityId: categoryId,
    entityName: existing?.name ?? null,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** The fields the "Add task" dialog can fill in up front. Everything is
 *  optional, so the quick one-line add still calls this with just a name. */
export type NewTaskDetails = Partial<{
  description: string | null;
  priority: "high" | "medium" | "low";
  status_id: string | null;
  due_date: string | null;
  assignee_id: string | null;
}>;

export async function createTask(
  projectId: string,
  categoryId: string | null,
  name: string,
  details: NewTaskDetails = {},
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
      ...details,
    })
    .select(
      "id, project_id, category_id, serial_no, name, description, priority, status_id, due_date, assignee_id, position, created_by, created_at, updated_at, estimate_minutes, recurrence, import_batch_id",
    )
    .single();

  if (error) return { error: error.message };

  void recordAudit({
    actorId: user.user?.id,
    action: "task.create",
    entityType: "task",
    entityId: data.id,
    entityName: name,
    projectId,
  });

  // Same fan-out an assignment through updateTask would produce — a task
  // created straight onto someone's plate has to reach them too.
  if (details.assignee_id) {
    void notifyNewAssignment(projectId, data.id, name, details.assignee_id);
  }

  revalidatePath(`/projects/${projectId}`);
  return { data };
}

async function notifyNewAssignment(
  projectId: string,
  taskId: string,
  taskName: string,
  assigneeId: string,
) {
  const supabase = await client();
  const [{ data: project }, { data: assignee }, who, leads] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", assigneeId).maybeSingle(),
    actor(),
    projectLeads(projectId),
  ]);
  if (!project) return;

  await notifyTaskAssigned({
    assigneeId,
    taskName,
    projectName: project.name,
    projectId,
  });

  await publishEvent({
    projectId,
    taskId,
    actorId: who.id,
    type: "assignment",
    title: `${who.name ?? "Someone"} assigned "${taskName}" to ${
      assignee?.full_name ?? "a team member"
    }`,
    body: `In ${project.name}.`,
    recipientIds: [assigneeId, ...leads],
  });
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
    void handleTaskNotifications(projectId, taskId, before, patch);
    void handleRecurrence(projectId, taskId, before, patch);
    void handleTaskAudit(projectId, taskId, before, patch);
  }

  return { ok: true };
}

/**
 * One audit entry per meaningful change, with the specific field called out
 * where it matters. Status and assignee changes get their own action codes
 * because they're the two people actually scan the Activity feed for.
 */
async function handleTaskAudit(
  projectId: string,
  taskId: string,
  before: { name: string; assignee_id: string | null; status_id: string | null },
  patch: TaskPatch,
) {
  const who = await actor();
  if (!who.id) return;

  const supabase = await client();
  const [{ data: project }, { data: status }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    "status_id" in patch && patch.status_id
      ? supabase.from("statuses").select("label").eq("id", patch.status_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const action =
    "status_id" in patch && patch.status_id !== before.status_id
      ? "task.status"
      : "assignee_id" in patch && patch.assignee_id !== before.assignee_id
        ? "task.assign"
        : "task.update";

  await recordAudit({
    actorId: who.id,
    action,
    entityType: "task",
    entityId: taskId,
    entityName: before.name,
    projectId,
    projectName: project?.name ?? null,
    meta: {
      fields: Object.keys(patch),
      ...(status?.label ? { status: status.label } : {}),
    },
  });
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
  const who = await actor();

  if (assigneeChanged && patch.assignee_id) {
    await notifyTaskAssigned({
      assigneeId: patch.assignee_id,
      taskName,
      projectName: project.name,
      projectId,
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

    // In-app: the assignee hears about it, and so do the project's leads —
    // including the Admin when they're one of them, which is how an Admin
    // assigned to a task gets it in their own personal notifications tab.
    const leads = await projectLeads(projectId);
    await publishEvent({
      projectId,
      taskId,
      actorId: who.id,
      type: "assignment",
      title: `${who.name ?? "Someone"} assigned "${taskName}" to ${
        assignee?.full_name ?? "a team member"
      }`,
      body: `In ${project.name}.`,
      recipientIds: [patch.assignee_id, ...leads],
    });
  }

  if (statusChanged && status) {
    const leads = await projectLeads(projectId);

    if (NOTIFY_STATUS_LABELS.has(status.label)) {
      const recipientId = project.manager_id ?? project.created_by;
      if (recipientId) {
        await notifyStatusChange({
          recipientId,
          taskName,
          projectName: project.name,
          statusLabel: status.label,
        });
      }
    }

    // Every status move is worth an in-app entry — it's what the Admin's
    // per-project board is for — but only the leads and the assignee get a
    // personal notification, so nobody's tab fills up with other people's work.
    await publishEvent({
      projectId,
      taskId,
      actorId: who.id,
      type: "status",
      title: `"${taskName}" is now ${status.label}`,
      body: `${who.name ?? "Someone"} moved it in ${project.name}.`,
      meta: { status: status.label },
      recipientIds: NOTIFY_STATUS_LABELS.has(status.label) || status.label === "Done"
        ? [...leads, before.assignee_id]
        : [],
    });
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
  const { data: existing } = await supabase
    .from("tasks")
    .select("name")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "task.delete",
    entityType: "task",
    entityId: taskId,
    entityName: existing?.name ?? null,
    projectId,
  });

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

  // A comment is feedback, so everyone with a stake in the task hears about
  // it: whoever it's assigned to, whoever created it, and the project's
  // managers. Clicking the notification opens this exact task.
  void notifyAboutComment(projectId, taskId, body, user.user?.id);

  revalidatePath(`/projects/${projectId}`);
  return { data };
}

async function notifyAboutComment(
  projectId: string,
  taskId: string,
  body: string,
  actorId: string | undefined,
) {
  const supabase = await client();
  const [{ data: task }, { data: project }, leads] = await Promise.all([
    supabase
      .from("tasks")
      .select("name, assignee_id, created_by")
      .eq("id", taskId)
      .maybeSingle(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    projectLeads(projectId),
  ]);
  if (!task) return;

  const who = await actor();
  const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body;

  await publishEvent({
    projectId,
    taskId,
    actorId,
    type: "comment",
    title: `${who.name ?? "Someone"} commented on "${task.name}"`,
    body: preview,
    recipientIds: [task.assignee_id, task.created_by, ...leads],
  });

  await recordAudit({
    actorId,
    action: "comment.create",
    entityType: "comment",
    entityId: taskId,
    entityName: task.name,
    projectId,
    projectName: project?.name ?? null,
  });
}

export async function deleteComment(projectId: string, commentId: string) {
  const supabase = await client();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { error: error.message };

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "comment.delete",
    entityType: "comment",
    entityId: commentId,
    projectId,
  });

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

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "task.bulk_update",
    entityType: "task",
    projectId,
    meta: { count: taskIds.length, fields: Object.keys(patch) },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function bulkDeleteTasks(projectId: string, taskIds: string[]) {
  const supabase = await client();
  const { error } = await supabase.from("tasks").delete().in("id", taskIds);
  if (error) return { error: error.message };

  const who = await actor();
  void recordAudit({
    actorId: who.id,
    action: "task.bulk_delete",
    entityType: "task",
    projectId,
    meta: { count: taskIds.length },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
