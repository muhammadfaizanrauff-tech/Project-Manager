"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFavorite(projectId: string, isFavorite: boolean) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Not signed in." };

  if (isFavorite) {
    await supabase
      .from("favorites")
      .insert({ user_id: user.user.id, project_id: projectId });
  } else {
    await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.user.id)
      .eq("project_id", projectId);
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}
