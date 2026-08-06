"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function requestTaskDeletion(
  projectId: string,
  taskId: string,
  taskName: string,
) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { error } = await supabase.from("delete_requests").insert({
    task_id: taskId,
    project_id: projectId,
    requested_by: user.user?.id,
    task_name: taskName,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function requestProjectDeletion(projectId: string, projectName: string) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  // Don't stack duplicates if they click twice or come back later.
  const { data: existing } = await supabase
    .from("delete_requests")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "project")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return { ok: true, alreadyRequested: true };

  const { error } = await supabase.from("delete_requests").insert({
    kind: "project",
    task_id: null,
    project_id: projectId,
    requested_by: user.user?.id,
    task_name: projectName,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function requestBulkTaskDeletion(
  projectId: string,
  tasks: { id: string; name: string }[],
) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { error } = await supabase.from("delete_requests").insert(
    tasks.map((t) => ({
      task_id: t.id,
      project_id: projectId,
      requested_by: user.user?.id,
      task_name: t.name,
    })),
  );
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
