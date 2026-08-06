"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Organizations are the Admin's tenancy boundary — one per company they work
 * with. Only the Admin creates them and decides who's in them, so every
 * action here checks for the admin role and then uses the service-role client
 * (organization RLS is admin-only, and the membership writes need to reach
 * rows the caller can't otherwise see).
 */
async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") return null;
  return profile;
}

export async function createOrganization(input: { name: string; description?: string }) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only the Admin can create organizations." };

  const name = input.name.trim();
  if (!name) return { error: "Organization name is required." };

  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .insert({
      name,
      description: input.description?.trim() || null,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // The Admin belongs to every organization they create, so their own pickers
  // and the organization's project list behave consistently.
  await service
    .from("organization_members")
    .insert({ org_id: data.id, user_id: admin.id })
    .select();

  void recordAudit({
    actorId: admin.id,
    action: "organization.create",
    entityType: "organization",
    entityId: data.id,
    entityName: name,
  });

  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true, id: data.id };
}

export async function updateOrganization(input: {
  id: string;
  name: string;
  description?: string;
}) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only the Admin can edit organizations." };

  const name = input.name.trim();
  if (!name) return { error: "Organization name is required." };

  const service = createServiceClient();
  const { error } = await service
    .from("organizations")
    .update({ name, description: input.description?.trim() || null })
    .eq("id", input.id);

  if (error) return { error: error.message };

  void recordAudit({
    actorId: admin.id,
    action: "organization.update",
    entityType: "organization",
    entityId: input.id,
    entityName: name,
  });

  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteOrganization(id: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only the Admin can delete organizations." };

  const service = createServiceClient();

  // Projects reference the organization with `on delete set null`, so they
  // survive as unassigned rather than vanishing. Say so plainly rather than
  // silently orphaning them.
  const { count } = await service
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", id);

  const { data: org } = await service
    .from("organizations")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await service.from("organizations").delete().eq("id", id);
  if (error) return { error: error.message };

  void recordAudit({
    actorId: admin.id,
    action: "organization.delete",
    entityType: "organization",
    entityId: id,
    entityName: org?.name ?? null,
    meta: { orphanedProjects: count ?? 0 },
  });

  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true, orphanedProjects: count ?? 0 };
}

/** Replace an organization's roster wholesale — the dialog submits the full list. */
export async function setOrganizationMembers(orgId: string, userIds: string[]) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only the Admin can change organization membership." };

  const service = createServiceClient();

  // The Admin always stays in, so an organization can never become
  // unreachable from the Admin's own pickers.
  const desired = Array.from(new Set([...userIds, admin.id]));

  const { data: existing } = await service
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId);

  const current = new Set((existing ?? []).map((r) => r.user_id));
  const toAdd = desired.filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !desired.includes(id));

  if (toAdd.length > 0) {
    const { error } = await service
      .from("organization_members")
      .insert(toAdd.map((userId) => ({ org_id: orgId, user_id: userId })));
    if (error) return { error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await service
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .in("user_id", toRemove);
    if (error) return { error: error.message };
  }

  void recordAudit({
    actorId: admin.id,
    action: "organization.update",
    entityType: "organization",
    entityId: orgId,
    meta: { added: toAdd.length, removed: toRemove.length },
  });

  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true };
}

/** Move a project between organizations. Admin only. */
export async function setProjectOrganization(projectId: string, orgId: string | null) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only the Admin can move a project between organizations." };

  const service = createServiceClient();
  const { error } = await service
    .from("projects")
    .update({ organization_id: orgId })
    .eq("id", projectId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
