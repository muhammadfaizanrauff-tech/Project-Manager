"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, created_by: user.id })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { data };
}

export async function createCategoryQuick(projectId: string, name: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data, error } = await supabase
    .from("categories")
    .insert({ project_id: projectId, name, position: count ?? 0 })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data };
}
