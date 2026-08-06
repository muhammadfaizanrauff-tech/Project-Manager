import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ProjectPerson = { id: string; full_name: string | null };

export type ProjectListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  start_date: string;
  end_date: string | null;
  managers: ProjectPerson[];
  member_count: number;
  task_total: number;
  task_done: number;
};

// A project's managers live in project_managers (schema-v9.sql) — one row per
// manager. Fetched in a single query and grouped here rather than per project.
async function managersByProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectIds: string[],
): Promise<Map<string, ProjectPerson[]>> {
  const grouped = new Map<string, ProjectPerson[]>();
  if (projectIds.length === 0) return grouped;

  const { data } = await supabase
    .from("project_managers")
    .select("project_id, profiles:user_id(id, full_name)")
    .in("project_id", projectIds);

  for (const row of data ?? []) {
    const person = row.profiles as unknown as ProjectPerson | null;
    if (!person) continue;
    const list = grouped.get(row.project_id) ?? [];
    list.push(person);
    grouped.set(row.project_id, list);
  }
  return grouped;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, logo_url, start_date, end_date")
    .order("created_at", { ascending: false });

  if (error || !projects) return [];

  const managers = await managersByProject(
    supabase,
    projects.map((p) => p.id),
  );

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
        managers: managers.get(p.id) ?? [],
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
  managers: ProjectPerson[];
  members: { id: string; full_name: string | null; role: string }[];
};

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, logo_url, start_date, end_date, created_by")
    .eq("id", id)
    .maybeSingle();

  if (error || !project) return null;

  const [{ data: members }, managers] = await Promise.all([
    supabase
      .from("project_members")
      .select("profiles:user_id(id, full_name, role)")
      .eq("project_id", id),
    managersByProject(supabase, [id]),
  ]);

  return {
    id: project.id,
    name: project.name,
    logo_url: project.logo_url,
    start_date: project.start_date,
    end_date: project.end_date,
    created_by: project.created_by,
    managers: managers.get(id) ?? [],
    members: (members ?? []).map(
      (m) => m.profiles as unknown as { id: string; full_name: string | null; role: string },
    ),
  };
}
