"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { notifyProjectAssigned } from "@/lib/email";
import { publishEvent } from "@/lib/notifications";
import { orgIdsForUser } from "@/lib/organizations";

export type CreateProjectState = {
  error?: string;
};

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();

  if (!user || !profile) {
    return { error: "You need to be signed in to create a project." };
  }

  // Anyone can create a project and owns what they create. Only Admins and
  // Managers get to hand it to a manager or staff it with other people —
  // ignore those fields for members rather than trusting the form.
  const canAssignPeople = profile.role === "admin" || profile.role === "manager";

  const name = String(formData.get("name") ?? "").trim();
  const managerIds = canAssignPeople
    ? Array.from(new Set(formData.getAll("managerIds").map(String).filter(Boolean)))
    : [];
  const startDate = String(formData.get("startDate") ?? "") || undefined;
  const endDate = String(formData.get("endDate") ?? "") || null;
  const memberIds = canAssignPeople
    ? formData.getAll("memberIds").map(String).filter(Boolean)
    : [];
  const logo = formData.get("logo");

  if (!name) {
    return { error: "Project name is required." };
  }

  // A project belongs to exactly one organization. The Admin may file it
  // anywhere; everyone else only into an organization they're actually in —
  // checked here as well as by RLS so the failure is a sentence rather than a
  // Postgres error code.
  const organizationId = String(formData.get("organizationId") ?? "") || null;
  if (profile.role !== "admin") {
    const myOrgs = await orgIdsForUser(user.id);
    if (myOrgs.length === 0) {
      return {
        error:
          "You're not in an organization yet, so there's nowhere to file this project. Ask the Admin to add you to one.",
      };
    }
    if (!organizationId || !myOrgs.includes(organizationId)) {
      return { error: "Pick one of your organizations for this project." };
    }
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
      // Legacy single-manager column, kept in sync with the first manager so a
      // deployment still reading it doesn't break. project_managers below is
      // the source of truth.
      manager_id: managerIds[0] ?? null,
      organization_id: organizationId,
      created_by: user.id,
      start_date: startDate,
      end_date: endDate,
    })
    .select("id")
    .single();

  if (error || !project) {
    // 42501 = row-level security refused the insert. Almost always means the
    // database is behind the app: schema-v5.sql opens project creation to
    // every signed-in user, and until it's applied only Admins and Managers
    // can insert. Say so rather than leaving a dead-end message.
    if (error?.code === "42501") {
      return {
        error:
          "The database hasn't been updated to allow this yet — run schema-catch-up.sql in the Supabase SQL editor, then try again.",
      };
    }
    return { error: error?.message ?? "Could not create the project." };
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
  if (managerIds.length > 0) {
    await supabase
      .from("project_managers")
      .insert(managerIds.map((userId) => ({ project_id: project.id, user_id: userId })));

    await Promise.all(
      managerIds
        .filter((id) => !memberIds.includes(id))
        .map((userId) => notifyProjectAssigned({ userId, projectName: name })),
    );
  }

  // Until someone is assigned, a new project is visible only to whoever made
  // it — this is the notification that makes it appear for everyone else.
  const assigned = Array.from(new Set([...memberIds, ...managerIds]));
  if (assigned.length > 0) {
    void publishEvent({
      projectId: project.id,
      actorId: user.id,
      type: "project_member",
      title: `${profile.full_name ?? "Someone"} added you to ${name}`,
      body: `You now have access to the project "${name}".`,
      recipientIds: assigned,
    });
  }

  void recordAudit({
    actorId: user.id,
    action: "project.create",
    entityType: "project",
    entityId: project.id,
    entityName: name,
    projectId: project.id,
    projectName: name,
    meta: { managers: managerIds.length, members: memberIds.length },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export type UpdateProjectState = {
  error?: string;
  // Timestamp rather than a boolean so the dialog can tell a fresh save from a
  // stale one — `ok: true` would stay true forever and slam the dialog shut
  // the next time it opened.
  savedAt?: number;
};

export async function updateProject(
  _prevState: UpdateProjectState,
  formData: FormData,
): Promise<UpdateProjectState> {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return { error: "You need to be signed in." };

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Project name is required." };

  // Same split as project creation: only Admins and Managers hand a project to
  // a manager or change who's staffed on it. RLS (can_edit_project) is what
  // actually decides whether this person may touch the project at all.
  const canAssignPeople = profile.role === "admin" || profile.role === "manager";

  const supabase = await createClient();
  const logo = formData.get("logo");

  let logoUrl: string | undefined;
  if (logo instanceof File && logo.size > 0) {
    const service = createServiceClient();
    const ext = logo.name.split(".").pop() || "png";
    const path = `${randomUUID()}.${ext}`;
    const { error: uploadError } = await service.storage
      .from("project-logos")
      .upload(path, logo, { contentType: logo.type, upsert: false });
    if (uploadError) return { error: "Could not upload logo. Try a smaller image." };

    logoUrl = service.storage.from("project-logos").getPublicUrl(path).data.publicUrl;
  }

  const managerIds = canAssignPeople
    ? Array.from(new Set(formData.getAll("managerIds").map(String).filter(Boolean)))
    : [];

  // Only the Admin may move a project between organizations — for anyone else
  // that would be a way to hand a project to a company they don't belong to.
  const organizationId = String(formData.get("organizationId") ?? "") || null;

  const { error } = await supabase
    .from("projects")
    .update({
      name,
      start_date: String(formData.get("startDate") ?? "") || undefined,
      end_date: String(formData.get("endDate") ?? "") || null,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      // Legacy column tracks the first manager; project_managers below is the
      // source of truth.
      ...(canAssignPeople ? { manager_id: managerIds[0] ?? null } : {}),
      ...(profile.role === "admin" && organizationId
        ? { organization_id: organizationId }
        : {}),
    })
    .eq("id", projectId);

  if (error) {
    if (error.code === "42501") {
      return { error: "You don't have permission to edit this project." };
    }
    return { error: error.message };
  }

  if (canAssignPeople) {
    const memberIds = Array.from(
      new Set(formData.getAll("memberIds").map(String).filter(Boolean)),
    );

    // Who's new matters: a project is invisible until you're put on it, so
    // being added is exactly when someone needs telling.
    const { data: previousMembers } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    const previousMemberIds = new Set((previousMembers ?? []).map((r) => r.user_id));

    // Replace both rosters wholesale — the form always submits the full lists.
    await supabase.from("project_members").delete().eq("project_id", projectId);
    if (memberIds.length > 0) {
      await supabase
        .from("project_members")
        .insert(memberIds.map((userId) => ({ project_id: projectId, user_id: userId })));
    }

    // Managers are diffed rather than replaced, and additions are written
    // before removals. Clearing the table first would strip the editor's own
    // manager row, and the follow-up insert is permission-checked against
    // can_manage_project — which they'd no longer pass, leaving the project
    // with no managers at all.
    const { data: existingManagers } = await supabase
      .from("project_managers")
      .select("user_id")
      .eq("project_id", projectId);

    const current = new Set((existingManagers ?? []).map((r) => r.user_id));
    const toAdd = managerIds.filter((id) => !current.has(id));
    const toRemove = Array.from(current).filter((id) => !managerIds.includes(id));

    if (toAdd.length > 0) {
      await supabase
        .from("project_managers")
        .insert(toAdd.map((userId) => ({ project_id: projectId, user_id: userId })));
    }
    if (toRemove.length > 0) {
      await supabase
        .from("project_managers")
        .delete()
        .eq("project_id", projectId)
        .in("user_id", toRemove);
    }

    const newlyAssigned = Array.from(
      new Set([
        ...memberIds.filter((id) => !previousMemberIds.has(id)),
        ...toAdd,
      ]),
    );
    if (newlyAssigned.length > 0) {
      await Promise.all(
        newlyAssigned.map((userId) => notifyProjectAssigned({ userId, projectName: name })),
      );
      void publishEvent({
        projectId,
        actorId: user.id,
        type: "project_member",
        title: `${profile.full_name ?? "Someone"} added you to ${name}`,
        body: `You now have access to the project "${name}".`,
        recipientIds: newlyAssigned,
      });
    }
  }

  void recordAudit({
    actorId: user.id,
    action: "project.update",
    entityType: "project",
    entityId: projectId,
    entityName: name,
    projectId,
    projectName: name,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { savedAt: Date.now() };
}

export async function deleteProject(projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { error: "Only Admins and Managers can delete projects." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: error.message };

  void recordAudit({
    actorId: profile.id,
    action: "project.delete",
    entityType: "project",
    entityId: projectId,
    entityName: existing?.name ?? null,
    projectName: existing?.name ?? null,
  });

  revalidatePath("/projects");
  redirect("/projects");
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
    .select("name, logo_url, manager_id, organization_id")
    .eq("id", projectId)
    .single();
  if (!original) return { error: "Project not found." };

  const { data: newProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: `${original.name} (Copy)`,
      logo_url: original.logo_url,
      manager_id: original.manager_id,
      organization_id: original.organization_id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (projectError || !newProject) return { error: "Could not clone the project." };

  const [{ data: members }, { data: managers }] = await Promise.all([
    supabase.from("project_members").select("user_id").eq("project_id", projectId),
    supabase.from("project_managers").select("user_id").eq("project_id", projectId),
  ]);
  if (members && members.length > 0) {
    await supabase.from("project_members").insert(
      members.map((m) => ({ project_id: newProject.id, user_id: m.user_id })),
    );
  }
  // The clone carries its manager roster over too — otherwise a co-manager
  // would silently lose sight of the copy.
  if (managers && managers.length > 0) {
    await supabase.from("project_managers").insert(
      managers.map((m) => ({ project_id: newProject.id, user_id: m.user_id })),
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

  void recordAudit({
    actorId: user.id,
    action: "project.clone",
    entityType: "project",
    entityId: newProject.id,
    entityName: `${original.name} (Copy)`,
    projectId: newProject.id,
    projectName: `${original.name} (Copy)`,
    meta: { clonedFrom: projectId },
  });

  revalidatePath("/projects");
  redirect(`/projects/${newProject.id}`);
}
