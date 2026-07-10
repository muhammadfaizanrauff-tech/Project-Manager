import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ProjectListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  start_date: string;
  end_date: string | null;
  manager: { id: string; full_name: string | null } | null;
  member_count: number;
  task_total: number;
  task_done: number;
};

export async function listProjects(): Promise<ProjectListItem[]> {
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, name, logo_url, start_date, end_date, manager:manager_id(id, full_name)",
    )
    .order("created_at", { ascending: false });

  if (error || !projects) return [];

  const results: ProjectListItem[] = await Promise.all(
    projects.map(async (p) => {
      const [{ count: memberCount }, { data: tasks }] = await Promise.all([
        supabase
          .from("project_members")
          .select("user_id", { count: "exact", head: true })
          .eq("project_id", p.id),
        supabase
          .from("tasks")
          .select("id, status_id, statuses:status_id(label)")
          .eq("project_id", p.id),
      ]);

      const taskTotal = tasks?.length ?? 0;
      const taskDone =
        tasks?.filter(
          (t) => (t.statuses as unknown as { label: string } | null)?.label === "Done",
        ).length ?? 0;

      return {
        id: p.id,
        name: p.name,
        logo_url: p.logo_url,
        start_date: p.start_date,
        end_date: p.end_date,
        manager: p.manager as unknown as { id: string; full_name: string | null } | null,
        member_count: memberCount ?? 0,
        task_total: taskTotal,
        task_done: taskDone,
      };
    }),
  );

  return results;
}

export async function listAssignableProfiles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });
  return data ?? [];
}

export type ProjectDetail = {
  id: string;
  name: string;
  logo_url: string | null;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  manager: { id: string; full_name: string | null } | null;
  members: { id: string; full_name: string | null; role: string }[];
};

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, name, logo_url, start_date, end_date, created_by, manager:manager_id(id, full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !project) return null;

  const { data: members } = await supabase
    .from("project_members")
    .select("profiles:user_id(id, full_name, role)")
    .eq("project_id", id);

  return {
    id: project.id,
    name: project.name,
    logo_url: project.logo_url,
    start_date: project.start_date,
    end_date: project.end_date,
    created_by: project.created_by,
    manager: project.manager as unknown as { id: string; full_name: string | null } | null,
    members: (members ?? []).map(
      (m) => m.profiles as unknown as { id: string; full_name: string | null; role: string },
    ),
  };
}
