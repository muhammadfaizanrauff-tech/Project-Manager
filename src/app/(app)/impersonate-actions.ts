"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { decryptJson, decryptPassword, encryptJson } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ACTIVE_SESSION_COOKIE, activeSessionCookieOptions } from "@/lib/supabase/session-marker";

// Full act-as impersonation: rather than bypassing RLS with a separate
// "impersonating" code path (which every mutation would then need to know
// about), this literally signs the browser's session into the target's real
// account using their stored credentials — so `auth.uid()` genuinely becomes
// the target everywhere, and every existing RLS policy and Server Action
// just works unmodified. The actor's own session is stashed (encrypted) in a
// cookie so "Exit" can restore it.
const IMPERSONATOR_COOKIE = "pm_impersonator";

type StashedSession = {
  actorId: string;
  access_token: string;
  refresh_token: string;
};

export async function startImpersonation(targetUserId: string) {
  const [actor, actorUser] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  if (!actor || !actorUser) return { error: "Not signed in." };
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { error: "Not authorized." };
  }
  if (targetUserId === actorUser.id) {
    return { error: "You're already signed in as yourself." };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(IMPERSONATOR_COOKIE)) {
    return { error: "Already viewing as someone else — exit that first." };
  }

  const service = createServiceClient();

  const { data: targetProfile } = await service
    .from("profiles")
    .select("id, role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!targetProfile) return { error: "User not found." };

  // Nobody may switch to the Admin. Managers may switch to members and
  // other managers; the Admin may switch to managers and members.
  if (targetProfile.role === "admin") {
    return { error: "You can't switch to the Admin account." };
  }

  const { data: credRow } = await service
    .from("credentials")
    .select("encrypted_password")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!credRow) return { error: "No stored credentials for this user — can't switch to them." };

  const { data: targetAuth } = await service.auth.admin.getUserById(targetUserId);
  const targetEmail = targetAuth?.user?.email;
  if (!targetEmail) return { error: "Could not look up that user's email." };

  const targetPassword = decryptPassword(credRow.encrypted_password);

  const supabase = await createClient();
  const {
    data: { session: actorSession },
  } = await supabase.auth.getSession();
  if (!actorSession) return { error: "Could not read your current session." };

  const stashed: StashedSession = {
    actorId: actorUser.id,
    access_token: actorSession.access_token,
    refresh_token: actorSession.refresh_token,
  };
  cookieStore.set(IMPERSONATOR_COOKIE, encryptJson(stashed), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: targetEmail,
    password: targetPassword,
  });
  if (signInError) {
    cookieStore.delete(IMPERSONATOR_COOKIE);
    return { error: "Could not switch to that user." };
  }

  cookieStore.set(ACTIVE_SESSION_COOKIE, "1", activeSessionCookieOptions);

  await service.from("impersonation_log").insert({
    actor_id: actorUser.id,
    target_id: targetUserId,
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  const stashedCookie = cookieStore.get(IMPERSONATOR_COOKIE)?.value;
  cookieStore.delete(IMPERSONATOR_COOKIE);

  if (!stashedCookie) {
    redirect("/settings");
  }

  let stashed: StashedSession | null = null;
  try {
    stashed = decryptJson<StashedSession>(stashedCookie);
  } catch {
    stashed = null;
  }

  const service = createServiceClient();
  if (stashed) {
    await service
      .from("impersonation_log")
      .update({ ended_at: new Date().toISOString() })
      .is("ended_at", null)
      .eq("actor_id", stashed.actorId);
  }

  const supabase = await createClient();

  if (stashed) {
    const { error } = await supabase.auth.setSession({
      access_token: stashed.access_token,
      refresh_token: stashed.refresh_token,
    });
    if (error) {
      // Stashed tokens have since expired — fall back to a clean logout
      // rather than leaving the actor stuck signed in as the target.
      await supabase.auth.signOut();
      cookieStore.delete(ACTIVE_SESSION_COOKIE);
      redirect("/login?expired=1");
    }
  }

  revalidatePath("/", "layout");
  redirect("/settings");
}
