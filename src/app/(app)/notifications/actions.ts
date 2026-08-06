"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Marking read is deliberately explicit rather than automatic-on-render: a
 * notification stays in the tab, unread, until you actually open it. That's
 * what makes the tab a to-do list rather than a log.
 */
export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin-only: dismiss a card on the per-project board. */
export async function markEventRead(eventId: string) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_events")
    .update({ read_by_admin_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { ok: true };
}

/** Admin-only: clear a whole project's column at once. */
export async function markProjectEventsRead(projectId: string) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_events")
    .update({ read_by_admin_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .is("read_by_admin_at", null);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { ok: true };
}
