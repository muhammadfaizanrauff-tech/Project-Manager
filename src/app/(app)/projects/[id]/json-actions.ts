"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Full-fidelity JSON snapshot of a project. Unlike the Excel/PDF exports
// (which flatten to a task table for reading), this keeps every field and the
// related rows so a project can be moved or restored.
export type ProjectBundle = {
  version: 1;
  exportedAt: string;
  project: {
    name: string;
    logo_url: string | null;
    start_date: string;
    end_date: string | null;
  };
  statuses: { id: string; label: string; color: string; position: number }[];
  categories: { id: string; name: string; position: number }[];
  tasks: Record<string, unknown>[];
  subtasks: Record<string, unknown>[];
  labels: { id: string; name: string; color: string }[];
  taskLabels: { task_id: string; label_id: string }[];
  comments: Record<string, unknown>[];
  timeLogs: Record<string, unknown>[];
};

export async function exportProjectJson(
  projectId: string,
): Promise<{ bundle: ProjectBundle } | { error: string }> {
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name, logo_url, start_date, end_date")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) return { error: "Project not found." };

  const [
    { data: statuses },
    { data: categories },
    { data: tasks },
    { data: labels },
  ] = await Promise.all([
    supabase.from("statuses").select("id, label, color, position").order("position"),
    supabase
      .from("categories")
      .select("id, name, position")
      .eq("project_id", projectId)
      .order("position"),
    supabase.from("tasks").select("*").eq("project_id", projectId).order("serial_no"),
    supabase.from("labels").select("id, name, color").eq("project_id", projectId),
  ]);

  const taskIds = (tasks ?? []).map((t) => t.id as string);

  // Related rows hang off tasks, so there's nothing to fetch when the project
  // has none — and `.in()` with an empty list would be a pointless round trip.
  const [{ data: subtasks }, { data: taskLabels }, { data: comments }, { data: timeLogs }] =
    taskIds.length > 0
      ? await Promise.all([
          supabase.from("subtasks").select("*").in("task_id", taskIds),
          supabase.from("task_labels").select("task_id, label_id").in("task_id", taskIds),
          supabase.from("comments").select("*").in("task_id", taskIds),
          supabase.from("time_logs").select("*").in("task_id", taskIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  return {
    bundle: {
      version: 1,
      exportedAt: new Date().toISOString(),
      project,
      statuses: statuses ?? [],
      categories: categories ?? [],
      tasks: tasks ?? [],
      subtasks: subtasks ?? [],
      labels: labels ?? [],
      taskLabels: taskLabels ?? [],
      comments: comments ?? [],
      timeLogs: timeLogs ?? [],
    },
  };
}

export type JsonImportSummary = {
  categories: number;
  tasks: number;
  subtasks: number;
  labels: number;
  warnings: string[];
};

export async function importProjectJson(
  projectId: string,
  bundle: ProjectBundle,
): Promise<JsonImportSummary | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can import." };
  }
  if (bundle?.version !== 1 || !Array.isArray(bundle.tasks)) {
    return { error: "That doesn't look like a project export file." };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
  const warnings: string[] = [];

  // Statuses are workspace-wide, so the exported ids only line up when
  // re-importing into the same workspace. Match on label instead, which also
  // works when moving between workspaces.
  const { data: currentStatuses } = await supabase.from("statuses").select("id, label");
  const statusIdByLabel = new Map(
    (currentStatuses ?? []).map((s) => [s.label.trim().toLowerCase(), s.id]),
  );
  const labelByOldStatusId = new Map(
    (bundle.statuses ?? []).map((s) => [s.id, s.label.trim().toLowerCase()]),
  );
  function resolveStatusId(oldId: unknown): string | null {
    if (typeof oldId !== "string") return null;
    const label = labelByOldStatusId.get(oldId);
    if (!label) return null;
    return statusIdByLabel.get(label) ?? null;
  }

  // ── Categories (merge by name so re-importing doesn't duplicate) ────────
  const { data: existingCategories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("project_id", projectId);
  const categoryIdByName = new Map(
    (existingCategories ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  let nextPosition = existingCategories?.length ?? 0;
  const categoryIdByOldId = new Map<string, string>();
  let createdCategories = 0;

  for (const category of bundle.categories ?? []) {
    const key = category.name.trim().toLowerCase();
    let id = categoryIdByName.get(key);
    if (!id) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ project_id: projectId, name: category.name, position: nextPosition++ })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`Could not create category "${category.name}".`);
        continue;
      }
      id = data.id;
      categoryIdByName.set(key, id);
      createdCategories++;
    }
    categoryIdByOldId.set(category.id, id);
  }

  // ── Labels (also merged by name) ────────────────────────────────────────
  const { data: existingLabels } = await supabase
    .from("labels")
    .select("id, name")
    .eq("project_id", projectId);
  const labelIdByName = new Map(
    (existingLabels ?? []).map((l) => [l.name.trim().toLowerCase(), l.id]),
  );
  const labelIdByOldId = new Map<string, string>();
  let createdLabels = 0;

  for (const label of bundle.labels ?? []) {
    const key = label.name.trim().toLowerCase();
    let id = labelIdByName.get(key);
    if (!id) {
      const { data, error } = await supabase
        .from("labels")
        .insert({ project_id: projectId, name: label.name, color: label.color })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`Could not create label "${label.name}".`);
        continue;
      }
      id = data.id;
      labelIdByName.set(key, id);
      createdLabels++;
    }
    labelIdByOldId.set(label.id, id);
  }

  // ── Tasks ───────────────────────────────────────────────────────────────
  // Always inserted as new rows: ids, serial numbers and authorship belong to
  // the destination project, so only the content carries over.
  const taskIdByOldId = new Map<string, string>();
  let createdTasks = 0;

  for (const task of bundle.tasks) {
    const oldId = task.id as string;
    const oldCategoryId = task.category_id as string | null;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        category_id: oldCategoryId ? categoryIdByOldId.get(oldCategoryId) ?? null : null,
        name: String(task.name ?? "").trim() || "Untitled task",
        description: (task.description as string | null) ?? null,
        priority: ["high", "medium", "low"].includes(task.priority as string)
          ? task.priority
          : "medium",
        status_id: resolveStatusId(task.status_id),
        due_date: (task.due_date as string | null) ?? null,
        estimate_minutes: (task.estimate_minutes as number | null) ?? null,
        recurrence: ["none", "daily", "weekly", "monthly"].includes(task.recurrence as string)
          ? task.recurrence
          : "none",
        position: typeof task.position === "number" ? task.position : 0,
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      warnings.push(`Could not import task "${task.name}".`);
      continue;
    }
    taskIdByOldId.set(oldId, data.id);
    createdTasks++;
  }

  // ── Subtasks and label links ────────────────────────────────────────────
  const subtaskRows = (bundle.subtasks ?? [])
    .map((s) => {
      const taskId = taskIdByOldId.get(s.task_id as string);
      if (!taskId) return null;
      return {
        task_id: taskId,
        name: String(s.name ?? ""),
        is_done: Boolean(s.is_done),
        position: typeof s.position === "number" ? s.position : 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (subtaskRows.length > 0) {
    const { error } = await supabase.from("subtasks").insert(subtaskRows);
    if (error) warnings.push("Some checklist items could not be imported.");
  }

  const taskLabelRows = (bundle.taskLabels ?? [])
    .map((tl) => {
      const taskId = taskIdByOldId.get(tl.task_id);
      const labelId = labelIdByOldId.get(tl.label_id);
      if (!taskId || !labelId) return null;
      return { task_id: taskId, label_id: labelId };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (taskLabelRows.length > 0) {
    await supabase.from("task_labels").insert(taskLabelRows);
  }

  if ((bundle.comments ?? []).length > 0 || (bundle.timeLogs ?? []).length > 0) {
    warnings.push(
      "Comments and time logs were skipped — they belong to the people who wrote them and can't be reassigned.",
    );
  }

  revalidatePath(`/projects/${projectId}`);
  return {
    categories: createdCategories,
    tasks: createdTasks,
    subtasks: subtaskRows.length,
    labels: createdLabels,
    warnings,
  };
}
