"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { defaultOrganizationForUser } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export async function listProjectsForImport() {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, name").order("name");
  return data ?? [];
}

export async function listCategoriesForProject(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("project_id", projectId)
    .order("name");
  return data ?? [];
}

export async function createProjectQuick(name: string) {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can create projects." };
  }

  // Filed under the creator's organization like every other way of making a
  // project — a project created here used to land with no organization at all,
  // which left it out of the Organizations view for good.
  const fallback = await defaultOrganizationForUser(user.id);
  const organizationId = fallback?.isMember ? fallback.id : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, created_by: user.id, organization_id: organizationId })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { data };
}

/** Same idempotence as `createCategory` in the project workspace: a name that
 *  already exists comes back as-is rather than becoming a second category. */
export async function createCategoryQuick(projectId: string, name: string) {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the category a name." };

  const { data: existing } = await supabase
    .from("categories")
    .select("id, name")
    .eq("project_id", projectId)
    .ilike("name", trimmed.replace(/[%_\\]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (existing) return { data: existing };

  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data, error } = await supabase
    .from("categories")
    .insert({ project_id: projectId, name: trimmed, position: count ?? 0 })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}
