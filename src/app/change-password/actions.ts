"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { ok: false as const, error: "Could not update password." };
  }

  await supabase.auth.signOut();
  redirect("/login?passwordChanged=1");
}
