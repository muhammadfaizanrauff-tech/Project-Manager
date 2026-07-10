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
