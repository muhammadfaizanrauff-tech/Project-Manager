"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import {
  defaultFolderForUser,
  isFoldersSchemaMissing,
  FOLDERS_SCHEMA_MISSING_MESSAGE,
} from "@/lib/folders";
import { defaultOrganizationForUser, orgIdsForUser } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export type FolderResult = {
  data?: { id: string; name: string; organization_id: string };
  error?: string;
};

/**
 * Create a folder in an organization.
 *
 * Only Admins and Managers get here — RLS (`can_manage_folders`) enforces it
 * underneath, and the UI doesn't offer the button to anyone else. A Manager who
 * submits no organization gets their own; one who names an organization is held
 * to naming one of theirs.
 */
export async function createFolder(
  name: string,
  organizationId?: string | null,
): Promise<FolderResult> {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return { error: "You need to be signed in." };

  if (profile.role !== "admin" && profile.role !== "manager") {
    return { error: "Only Admins and Managers can create folders." };
  }

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the folder a name." };
  if (trimmed.length > 60) return { error: "That folder name is too long." };

  let targetOrg = organizationId ?? null;

  if (targetOrg && profile.role !== "admin") {
    const mine = await orgIdsForUser(user.id);
    if (!mine.includes(targetOrg)) {
      return { error: "Pick one of your own organizations for this folder." };
    }
  }

  if (!targetOrg) {
    const fallback = await defaultOrganizationForUser(user.id);
    // A Manager who belongs to no organization can't file anything anywhere —
    // say so plainly rather than failing on the not-null constraint.
    if (!fallback?.isMember && profile.role !== "admin") {
      return { error: "You aren't in an organization yet, so there's nowhere to put a folder." };
    }
    targetOrg = fallback?.id ?? null;
  }

  if (!targetOrg) return { error: "No organization to put this folder in." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_folders")
    .insert({ organization_id: targetOrg, name: trimmed, created_by: user.id })
    .select("id, name, organization_id")
    .single();

  if (error || !data) {
    // 23505 = the case-insensitive unique index on (organization_id, name).
    if (error?.code === "23505") {
      return { error: `There's already a folder called "${trimmed}" here.` };
    }
    if (isFoldersSchemaMissing(error)) {
      return { error: FOLDERS_SCHEMA_MISSING_MESSAGE };
    }
    if (error?.code === "42501") {
      return { error: "You don't have permission to add a folder there." };
    }
    return { error: error?.message ?? "Could not create the folder." };
  }

  void recordAudit({
    actorId: user.id,
    action: "folder.create",
    entityType: "folder",
    entityId: data.id,
    entityName: data.name,
  });

  revalidatePath("/projects");
  return { data };
}

/**
 * Re-file a project, or take it out of every folder (`folderId: null`).
 *
 * Permission is the project's, not the folder's: whoever may edit the project
 * may move it, which `projects_update` → `can_manage_project()` already decides.
 * The folder still has to be one the mover can file into, or this would be a
 * way to push a project into another company's filing.
 */
export async function moveProjectToFolder(
  projectId: string,
  folderId: string | null,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return { error: "You need to be signed in." };

  const supabase = await createClient();

  // Read through the caller's own RLS view: a project they can't see is a
  // project they can't move, without a second permission check here.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { error: "Project not found." };

  let folderName: string | null = null;

  if (folderId) {
    const { data: folder } = await supabase
      .from("project_folders")
      .select("id, name, organization_id")
      .eq("id", folderId)
      .maybeSingle();

    // Invisible under RLS means not in one of their organizations.
    if (!folder) return { error: "That folder isn't available to you." };

    // The database trigger (schema-v13) refuses this too; catching it here
    // turns a raised exception into a sentence someone can act on.
    if (project.organization_id && folder.organization_id !== project.organization_id) {
      return { error: "That folder belongs to a different organization than the project." };
    }
    folderName = folder.name;
  }

  const { error } = await supabase
    .from("projects")
    .update({ folder_id: folderId })
    .eq("id", projectId);

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to move this project." };
    }
    if (isFoldersSchemaMissing(error)) {
      return { error: FOLDERS_SCHEMA_MISSING_MESSAGE };
    }
    return { error: error.message };
  }

  void recordAudit({
    actorId: user.id,
    action: "project.move",
    entityType: "project",
    entityId: projectId,
    entityName: project.name,
    projectId,
    projectName: project.name,
    meta: { folder: folderName ?? "Unfiled" },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** The folder a fresh project would be filed into for the signed-in user —
 *  what the New Project dialog opens on. */
export async function myDefaultFolder() {
  const user = await getCurrentUser();
  if (!user) return null;
  return defaultFolderForUser(user.id);
}
