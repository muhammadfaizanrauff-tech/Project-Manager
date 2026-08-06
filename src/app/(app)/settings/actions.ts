"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { decryptPassword, encryptPassword } from "@/lib/crypto";
import { orgIdsForUser } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireRole(...roles: Array<"admin" | "manager">) {
  const profile = await getCurrentProfile();
  if (!profile || !roles.includes(profile.role as "admin" | "manager")) {
    throw new Error("Not authorized.");
  }
  return profile;
}

// ── Profile ─────────────────────────────────────────────────────────────
export async function updateOwnProfile(fullName: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Users ───────────────────────────────────────────────────────────────
export async function createManagedUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "manager" | "member";
  /** Which organizations to place them in. Ignored for Managers — see below. */
  organizationIds?: string[];
}) {
  const actor = await requireRole("admin", "manager");
  const role = actor.role === "manager" ? "member" : input.role;

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, role },
  });
  if (error) return { error: error.message };

  await service
    .from("profiles")
    .upsert({ id: data.user.id, full_name: input.fullName, role, created_by: actor.id });

  await service.from("credentials").upsert({
    user_id: data.user.id,
    encrypted_password: encryptPassword(input.password),
    updated_at: new Date().toISOString(),
  });

  // A new user has to land in an organization or nobody — not even the person
  // who just created them — will be able to staff them onto a project. A
  // Manager's new users always join that Manager's own organizations; the
  // Admin picks explicitly.
  const orgIds =
    actor.role === "manager"
      ? await orgIdsForUser(actor.id)
      : Array.from(new Set(input.organizationIds ?? []));

  if (orgIds.length > 0) {
    await service
      .from("organization_members")
      .insert(orgIds.map((orgId) => ({ org_id: orgId, user_id: data.user.id })));
  }

  void recordAudit({
    actorId: actor.id,
    action: "user.create",
    entityType: "user",
    entityId: data.user.id,
    entityName: input.fullName,
    meta: { role, organizations: orgIds.length },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function revealUserPassword(userId: string) {
  await requireRole("admin");
  const service = createServiceClient();
  const { data, error } = await service
    .from("credentials")
    .select("encrypted_password")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { error: "No stored password for this user." };
  return { password: decryptPassword(data.encrypted_password) };
}

export async function changeUserPassword(userId: string, newPassword: string) {
  const admin = await requireRole("admin");
  const service = createServiceClient();

  const { error } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { error: error.message };

  await service.from("credentials").upsert({
    user_id: userId,
    encrypted_password: encryptPassword(newPassword),
    updated_at: new Date().toISOString(),
  });

  void recordAudit({
    actorId: admin.id,
    action: "password.change",
    entityType: "user",
    entityId: userId,
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteManagedUser(userId: string, targetRole: "admin" | "manager" | "member") {
  const actor = await requireRole("admin", "manager");
  if (actor.role === "manager" && targetRole !== "member") {
    return { error: "Managers can only delete members." };
  }

  const service = createServiceClient();

  // A Manager may only reach people inside their own organizations — without
  // this check the user id alone would be enough to delete anyone's member.
  if (actor.role === "manager") {
    const [actorOrgs, { data: targetOrgs }] = await Promise.all([
      orgIdsForUser(actor.id),
      service.from("organization_members").select("org_id").eq("user_id", userId),
    ]);
    const shared = (targetOrgs ?? []).some((r) => actorOrgs.includes(r.org_id));
    if (!shared) return { error: "That user isn't in one of your organizations." };
  }

  const { data: target } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  void recordAudit({
    actorId: actor.id,
    action: "user.delete",
    entityType: "user",
    entityId: userId,
    entityName: target?.full_name ?? null,
    meta: { role: targetRole },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// ── Statuses ────────────────────────────────────────────────────────────
export async function createStatus(label: string, color: string) {
  await requireRole("admin");
  const supabase = await createClient();
  const { count } = await supabase.from("statuses").select("id", { count: "exact", head: true });
  const { error } = await supabase
    .from("statuses")
    .insert({ label, color, position: count ?? 0 });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteStatus(id: string) {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("statuses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Delete requests ─────────────────────────────────────────────────────
export async function approveDeleteRequest(requestId: string) {
  await requireRole("admin");
  const supabase = await createClient();

  const { data: request, error: fetchError } = await supabase
    .from("delete_requests")
    .select("task_id, project_id, kind")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { error: "Delete request not found." };

  if (request.kind === "project") {
    // Cascades to the project's tasks, categories, members and remaining
    // delete requests via the schema's on delete cascade.
    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", request.project_id);
    if (deleteError) return { error: deleteError.message };
    revalidatePath("/projects");
  } else if (request.task_id) {
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", request.task_id);
    if (deleteError) return { error: deleteError.message };
  }

  const { error } = await supabase
    .from("delete_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  const admin = await getCurrentProfile();
  void recordAudit({
    actorId: admin?.id,
    action: "delete_request.resolve",
    entityType: request.kind === "project" ? "project" : "task",
    entityId: requestId,
    projectId: request.project_id,
    meta: { outcome: "approved", kind: request.kind },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function rejectDeleteRequest(requestId: string) {
  const admin = await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("delete_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  void recordAudit({
    actorId: admin.id,
    action: "delete_request.resolve",
    entityType: "task",
    entityId: requestId,
    meta: { outcome: "rejected" },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// ── Password change requests ────────────────────────────────────────────
// Users can't change their own password directly — they file a request here
// (see src/app/change-password/actions.ts) that the Admin approves.
export async function revealRequestedPassword(requestId: string) {
  await requireRole("admin");
  const service = createServiceClient();
  const { data, error } = await service
    .from("password_change_requests")
    .select("encrypted_password")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) return { error: "Request not found." };
  return { password: decryptPassword(data.encrypted_password) };
}

export async function approvePasswordRequest(requestId: string) {
  await requireRole("admin");
  const service = createServiceClient();

  const { data: request } = await service
    .from("password_change_requests")
    .select("user_id, encrypted_password, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "That request was already resolved." };

  const { error: updateError } = await service.auth.admin.updateUserById(request.user_id, {
    password: decryptPassword(request.encrypted_password),
  });
  if (updateError) return { error: updateError.message };

  // Keep the Admin-visible copy in sync with what the account now uses.
  await service.from("credentials").upsert({
    user_id: request.user_id,
    encrypted_password: request.encrypted_password,
    updated_at: new Date().toISOString(),
  });

  const { error } = await service
    .from("password_change_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function rejectPasswordRequest(requestId: string) {
  await requireRole("admin");
  const service = createServiceClient();

  const { error } = await service
    .from("password_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

// ── Meeting links (global) ───────────────────────────────────────────────
export async function createMeetingLink(label: string, url: string) {
  await requireRole("admin", "manager");
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("meeting_links")
    .insert({ label, url, project_id: null, created_by: user?.id });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteMeetingLink(id: string) {
  await requireRole("admin", "manager");
  const supabase = await createClient();
  const { error } = await supabase.from("meeting_links").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
