"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { decryptPassword, encryptPassword } from "@/lib/crypto";
import { orgIdsForUser } from "@/lib/organizations";
import { AVATAR_BUCKET, uploadPublicImage } from "@/lib/storage";
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

/**
 * Edit an existing account.
 *
 * The Admin can change everything — display name, sign-in email, role, which
 * organizations they belong to, their avatar, and their password. A Manager
 * can only rename a Member inside one of their own organizations; every other
 * field is ignored rather than rejected, so the narrower form simply does
 * less rather than erroring.
 *
 * FormData because the avatar is a File.
 */
export async function updateManagedUser(formData: FormData) {
  const actor = await requireRole("admin", "manager");
  const service = createServiceClient();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const { data: target } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "User not found." };

  const isAdmin = actor.role === "admin";

  if (!isAdmin) {
    // A Manager may only touch Members who share one of their organizations.
    if (target.role !== "member") {
      return { error: "Managers can only edit member accounts." };
    }
    const [actorOrgs, { data: targetOrgs }] = await Promise.all([
      orgIdsForUser(actor.id),
      service.from("organization_members").select("org_id").eq("user_id", userId),
    ]);
    if (!(targetOrgs ?? []).some((r) => actorOrgs.includes(r.org_id))) {
      return { error: "That user isn't in one of your organizations." };
    }
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { error: "Name is required." };

  const email = String(formData.get("email") ?? "").trim();
  const newPassword = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as "admin" | "manager" | "member";
  const avatar = formData.get("avatar");

  // Never let the last Admin demote themselves out of existence — there would
  // be nobody left who can create organizations or approve requests.
  if (isAdmin && target.role === "admin" && role && role !== "admin") {
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { error: "This is the only Admin account — promote someone else first." };
    }
  }

  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    const upload = await uploadPublicImage(AVATAR_BUCKET, avatar);
    if (upload.error) return { error: upload.error };
    avatarUrl = upload.url;
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      full_name: fullName,
      ...(isAdmin && role ? { role } : {}),
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  if (isAdmin) {
    const authPatch: { email?: string; password?: string; user_metadata?: object } = {
      user_metadata: { full_name: fullName, role: role || target.role },
    };
    if (email) authPatch.email = email;
    if (newPassword) {
      if (newPassword.length < 8) {
        return { error: "A new password needs to be at least 8 characters." };
      }
      authPatch.password = newPassword;
    }

    const { error: authError } = await service.auth.admin.updateUserById(userId, authPatch);
    if (authError) return { error: authError.message };

    // Keep the Admin-visible copy in step with what the account now uses.
    if (newPassword) {
      await service.from("credentials").upsert({
        user_id: userId,
        encrypted_password: encryptPassword(newPassword),
        updated_at: new Date().toISOString(),
      });
    }

    // Organizations are submitted as the complete list, so diff rather than
    // clear-and-reinsert — a wipe would briefly orphan the user from every
    // picker if the follow-up insert failed.
    //
    // Gated on its own flag rather than on organizationIds being present:
    // deselecting every organization submits no ids at all, and that has to
    // mean "remove them from all" rather than "leave them alone".
    if (String(formData.get("syncOrganizations") ?? "") === "1") {
      const desired = Array.from(
        new Set(formData.getAll("organizationIds").map(String).filter(Boolean)),
      );
      const { data: existing } = await service
        .from("organization_members")
        .select("org_id")
        .eq("user_id", userId);

      const current = new Set((existing ?? []).map((r) => r.org_id));
      const toAdd = desired.filter((id) => !current.has(id));
      const toRemove = Array.from(current).filter((id) => !desired.includes(id));

      if (toAdd.length > 0) {
        await service
          .from("organization_members")
          .insert(toAdd.map((orgId) => ({ org_id: orgId, user_id: userId })));
      }
      if (toRemove.length > 0) {
        await service
          .from("organization_members")
          .delete()
          .eq("user_id", userId)
          .in("org_id", toRemove);
      }
    }
  }

  void recordAudit({
    actorId: actor.id,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    entityName: fullName,
    meta: {
      changedEmail: isAdmin && Boolean(email),
      changedRole: isAdmin && Boolean(role) && role !== target.role,
      changedPassword: isAdmin && Boolean(newPassword),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/projects");
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
