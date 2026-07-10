import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listFavoriteProjects(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("project_id, projects:project_id(id, name)")
    .eq("user_id", userId);

  return (data ?? [])
    .map((row) => row.projects as unknown as { id: string; name: string } | null)
    .filter((p): p is { id: string; name: string } => Boolean(p));
}

export async function listFavoriteProjectIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("project_id").eq("user_id", userId);
  return (data ?? []).map((r) => r.project_id);
}
