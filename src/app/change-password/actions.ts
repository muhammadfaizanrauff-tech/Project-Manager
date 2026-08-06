"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { encryptPassword } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function verifyCurrentPassword(
  email: string,
  currentPassword: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (error) {
    return { ok: false as const, error: "Current password is incorrect." };
  }
  return { ok: true as const };
}

export async function requestPasswordReset(email: string) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/change-password`,
  });

  if (error) {
    return {
      ok: false as const,
      error: "Could not send a reset link. Check the email and try again.",
    };
  }
  return { ok: true as const };
}

export async function setNewPassword(newPassword: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Your session expired — sign in and try again." };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // The Admin owns the workspace, so there's nobody to approve their change —
  // apply it straight away. Everyone else files a request the Admin reviews
  // in Settings → Password Requests; their current password keeps working
  // until it's approved.
  if (profile?.role === "admin") {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false as const, error: "Could not update password." };
    }

    // Keep the encrypted copy in sync so the Admin panel's reveal/change
    // password feature stays correct after a self-service reset.
    await service
      .from("credentials")
      .update({ encrypted_password: encryptPassword(newPassword) })
      .eq("user_id", user.id);

    await supabase.auth.signOut();
    redirect("/login?passwordChanged=1");
  }

  // Supersede any earlier request from this user that's still waiting, so the
  // Admin only ever sees the password they most recently asked for.
  await service
    .from("password_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending");

  const { error: requestError } = await service.from("password_change_requests").insert({
    user_id: user.id,
    encrypted_password: encryptPassword(newPassword),
  });
  if (requestError) {
    return { ok: false as const, error: "Could not submit the request. Try again." };
  }

  await supabase.auth.signOut();
  redirect("/login?passwordRequested=1");
}
