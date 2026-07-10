"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ImportRow = {
  name: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  category?: string;
};

export type ImportSummary = {
  created: number;
  warnings: string[];
};

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

export async function bulkImportTasks(
  projectId: string,
  rows: ImportRow[],
): Promise<ImportSummary | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can import tasks." };
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const warnings: string[] = [];

  const [{ data: existingCategories }, { data: statuses }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("project_id", projectId),
    supabase.from("statuses").select("id, label"),
  ]);

  const categoryByName = new Map(
    (existingCategories ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  const statusByLabel = new Map(
    (statuses ?? []).map((s) => [s.label.trim().toLowerCase(), s.id]),
  );

  let nextCategoryPosition = existingCategories?.length ?? 0;
  const newCategoryNames = new Set<string>();
  for (const row of rows) {
    const name = row.category?.trim();
    if (name && !categoryByName.has(name.toLowerCase())) {
      newCategoryNames.add(name);
    }
  }

  for (const name of newCategoryNames) {
    const { data, error } = await supabase
      .from("categories")
      .insert({ project_id: projectId, name, position: nextCategoryPosition++ })
      .select("id, name")
      .single();
    if (error) {
      warnings.push(`Could not create category "${name}": ${error.message}`);
      continue;
    }
    categoryByName.set(name.toLowerCase(), data.id);
  }

  const taskRows = rows.map((row, index) => {
    let priority: "high" | "medium" | "low" = "medium";
    if (row.priority) {
      const normalized = row.priority.trim().toLowerCase();
      if (VALID_PRIORITIES.has(normalized)) {
        priority = normalized as "high" | "medium" | "low";
      } else {
        warnings.push(`Row ${index + 1}: unknown priority "${row.priority}", defaulted to Medium.`);
      }
    }

    let status_id: string | null = null;
    if (row.status) {
      const normalized = row.status.trim().toLowerCase();
      status_id = statusByLabel.get(normalized) ?? null;
      if (!status_id) {
        warnings.push(`Row ${index + 1}: unknown status "${row.status}", left unset.`);
      }
    }

    let category_id: string | null = null;
    if (row.category) {
      category_id = categoryByName.get(row.category.trim().toLowerCase()) ?? null;
    }

    let due_date: string | null = null;
    if (row.dueDate) {
      const parsed = new Date(row.dueDate);
      if (!Number.isNaN(parsed.getTime())) {
        due_date = parsed.toISOString().slice(0, 10);
      } else {
        warnings.push(`Row ${index + 1}: unrecognized date "${row.dueDate}", left blank.`);
      }
    }

    return {
      project_id: projectId,
      category_id,
      name: row.name.trim(),
      description: row.description?.trim() || null,
      priority,
      status_id,
      due_date,
      created_by: user.user?.id,
    };
  });

  const validRows = taskRows.filter((r) => r.name.length > 0);
  if (validRows.length === 0) {
    return { error: "No valid rows to import — every row needs a task name." };
  }

  const { error: insertError } = await supabase.from("tasks").insert(validRows);
  if (insertError) {
    return { error: `Import failed: ${insertError.message}` };
  }

  revalidatePath(`/projects/${projectId}`);
  return { created: validRows.length, warnings };
}
