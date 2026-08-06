"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { projectLeads, publishEvent } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

/**
 * A delete request is a member asking for something they can't do themselves,
 * so it has to reach someone who can: the project's leads see it on their
 * notification tab, and it lands on the Admin's project board. Without this
 * the request would sit silently in Settings until somebody happened to look.
 */
async function announceDeleteRequest(
  projectId: string,
  actorId: string | undefined,
  label: string,
  kind: "task" | "project",
) {
  const supabase = await createClient();
  const [{ data: profile }, leads] = await Promise.all([
    actorId
      ? supabase.from("profiles").select("full_name").eq("id", actorId).maybeSingle()
      : Promise.resolve({ data: null }),
    projectLeads(projectId),
  ]);

  const who = profile?.full_name ?? "Someone";

  await publishEvent({
    projectId,
    actorId,
    type: "delete_request",
    title: `${who} asked to delete ${kind === "project" ? "the project" : ""} "${label}"`,
    body: "Waiting on an Admin to approve or reject it in Settings → Delete Requests.",
    meta: { kind },
    recipientIds: leads,
  });

  await recordAudit({
    actorId,
    action: "delete_request.create",
    entityType: kind,
    entityName: label,
    projectId,
  });
}

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

  void announceDeleteRequest(projectId, user.user?.id, taskName, "task");

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

  void announceDeleteRequest(projectId, user.user?.id, projectName, "project");

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

  void announceDeleteRequest(
    projectId,
    user.user?.id,
    `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
    "task",
  );

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
