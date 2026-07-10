"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchResults = {
  projects: { id: string; name: string }[];
  tasks: { id: string; name: string; project_id: string; serial_no: number }[];
};

export async function searchWorkspace(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { projects: [], tasks: [] };

  const supabase = await createClient();

  const [projectsRes, tasksRes] = await Promise.all([
    supabase.from("projects").select("id, name").ilike("name", `%${trimmed}%`).limit(6),
    supabase
      .from("tasks")
      .select("id, name, project_id, serial_no")
      .ilike("name", `%${trimmed}%`)
      .limit(8),
  ]);

  return {
    projects: projectsRes.data ?? [],
    tasks: tasksRes.data ?? [],
  };
}
