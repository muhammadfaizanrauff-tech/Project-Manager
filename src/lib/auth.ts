import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "manager" | "member";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  avatar_url: string | null;
  theme: "light" | "dark" | null;
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The `profiles` table is created in Phase 3 (database schema). Until then
  // this resolves to null so pages can render without crashing.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, theme")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Cheap presence check (no decryption) — true while an admin/manager is
// "switched to" someone else via impersonate-actions.ts.
export async function isImpersonating() {
  const cookieStore = await cookies();
  return cookieStore.get("pm_impersonator") !== undefined;
}
