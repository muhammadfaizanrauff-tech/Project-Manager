"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { decryptPassword, encryptPassword } from "@/lib/crypto";
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
    .upsert({ id: data.user.id, full_name: input.fullName, role });

  await service.from("credentials").upsert({
    user_id: data.user.id,
    encrypted_password: encryptPassword(input.password),
    updated_at: new Date().toISOString(),
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
  await requireRole("admin");
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

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteManagedUser(userId: string, targetRole: "admin" | "manager" | "member") {
  const actor = await requireRole("admin", "manager");
  if (actor.role === "manager" && targetRole !== "member") {
    return { error: "Managers can only delete members." };
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

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
