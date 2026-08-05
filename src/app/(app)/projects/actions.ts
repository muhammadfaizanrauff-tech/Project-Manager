"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { notifyProjectAssigned } from "@/lib/email";

export type CreateProjectState = {
  error?: string;
};

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();

  if (!user || !profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can create projects." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const managerId = String(formData.get("managerId") ?? "") || null;
  const startDate = String(formData.get("startDate") ?? "") || undefined;
  const endDate = String(formData.get("endDate") ?? "") || null;
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const logo = formData.get("logo");

  if (!name) {
    return { error: "Project name is required." };
  }

  let logoUrl: string | null = null;
  if (logo instanceof File && logo.size > 0) {
    const service = createServiceClient();
    const ext = logo.name.split(".").pop() || "png";
    const path = `${randomUUID()}.${ext}`;
    const { error: uploadError } = await service.storage
      .from("project-logos")
      .upload(path, logo, { contentType: logo.type, upsert: false });

    if (uploadError) {
      return { error: "Could not upload logo. Try a smaller image." };
    }

    const { data: publicUrl } = service.storage
      .from("project-logos")
      .getPublicUrl(path);
    logoUrl = publicUrl.publicUrl;
  }

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name,
      logo_url: logoUrl,
      manager_id: managerId,
      created_by: user.id,
      start_date: startDate,
      end_date: endDate,
    })
    .select("id")
    .single();

  if (error || !project) {
    return { error: "Could not create the project." };
  }

  const memberRows = Array.from(new Set(memberIds)).map((userId) => ({
    project_id: project.id,
    user_id: userId,
  }));

  if (memberRows.length > 0) {
    await supabase.from("project_members").insert(memberRows);
    await Promise.all(
      memberRows.map((row) =>
        notifyProjectAssigned({ userId: row.user_id, projectName: name }),
      ),
    );
  }
  if (managerId && !memberIds.includes(managerId)) {
    await notifyProjectAssigned({ userId: managerId, projectName: name });
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function cloneProject(projectId: string) {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can clone projects." };
  }

  const supabase = await createClient();

  const { data: original } = await supabase
    .from("projects")
    .select("name, logo_url, manager_id")
    .eq("id", projectId)
    .single();
  if (!original) return { error: "Project not found." };

  const { data: newProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: `${original.name} (Copy)`,
      logo_url: original.logo_url,
      manager_id: original.manager_id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (projectError || !newProject) return { error: "Could not clone the project." };

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);
  if (members && members.length > 0) {
    await supabase.from("project_members").insert(
      members.map((m) => ({ project_id: newProject.id, user_id: m.user_id })),
    );
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, position")
    .eq("project_id", projectId)
    .order("position");

  for (const category of categories ?? []) {
    const { data: newCategory } = await supabase
      .from("categories")
      .insert({ project_id: newProject.id, name: category.name, position: category.position })
      .select("id")
      .single();
    if (!newCategory) continue;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("name, description, priority, position")
      .eq("category_id", category.id)
      .order("position");

    if (tasks && tasks.length > 0) {
      await supabase.from("tasks").insert(
        tasks.map((t) => ({
          project_id: newProject.id,
          category_id: newCategory.id,
          name: t.name,
          description: t.description,
          priority: t.priority,
          position: t.position,
          created_by: user.id,
        })),
      );
    }
  }

  revalidatePath("/projects");
  redirect(`/projects/${newProject.id}`);
}
