"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SESSION_COOKIE, activeSessionCookieOptions } from "@/lib/supabase/session-marker";

export type LoginState = {
  error?: string;
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // Marks this browser session as active. Unlike the Supabase auth cookie (long-lived
  // by design), this one has no maxAge — the browser drops it the moment the whole
  // browser process closes, and `updateSession` (middleware.ts) treats its absence as
  // "log back in", satisfying the log-out-on-browser-close requirement.
  (await cookies()).set(ACTIVE_SESSION_COOKIE, "1", activeSessionCookieOptions);

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_SESSION_COOKIE);
  redirect("/login");
}
