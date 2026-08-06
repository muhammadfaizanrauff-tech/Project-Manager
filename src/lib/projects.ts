import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { visiblePeopleForUser } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export type ProjectPerson = { id: string; full_name: string | null };

export type ProjectListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  start_date: string;
  end_date: string | null;
  organization_id: string | null;
  organization_name: string | null;
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
    .select("id, name, logo_url, start_date, end_date, organization_id")
    .order("created_at", { ascending: false });

  if (error || !projects) return [];

  const [managers, { data: orgs }] = await Promise.all([
    managersByProject(
      supabase,
      projects.map((p) => p.id),
    ),
    supabase.from("organizations").select("id, name"),
  ]);
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

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
        organization_id: p.organization_id,
        organization_name: p.organization_id
          ? orgNameById.get(p.organization_id) ?? null
          : null,
        managers: managers.get(p.id) ?? [],
        member_count: memberCount ?? 0,
        task_total: taskTotal,
        task_done: taskDone,
      };
    }),
  );

  return results;
}

export type AssignablePerson = {
  id: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  org_ids: string[];
};

/**
 * Who the signed-in user may put on a project, each tagged with the
 * organizations they belong to.
 *
 * The Admin can staff anyone. Everyone else only ever sees people from the
 * organizations they belong to — that's the whole point of organizations, and
 * it's why one company's Manager never sees another company's staff list.
 *
 * The org tags come back with the people rather than as a second query per
 * selection, so the project dialogs can re-filter the picker the instant a
 * different organization is chosen without a round trip.
 */
export async function listAssignablePeopleWithOrgs(): Promise<AssignablePerson[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const people = await visiblePeopleForUser(profile.id, profile.role);
  if (people.length === 0) return [];

  const supabase = await createClient();
  const { data: orgRows } = await supabase
    .from("organization_members")
    .select("org_id, user_id")
    .in(
      "user_id",
      people.map((p) => p.id),
    );

  const orgsByUser = new Map<string, string[]>();
  for (const row of orgRows ?? []) {
    const list = orgsByUser.get(row.user_id) ?? [];
    list.push(row.org_id);
    orgsByUser.set(row.user_id, list);
  }

  return people.map((p) => ({ ...p, org_ids: orgsByUser.get(p.id) ?? [] }));
}

export type ProjectDetail = {
  id: string;
  name: string;
  logo_url: string | null;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  organization_id: string | null;
  organization_name: string | null;
  managers: ProjectPerson[];
  members: { id: string; full_name: string | null; role: string }[];
};

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, logo_url, start_date, end_date, created_by, organization_id, organization:organization_id(name)")
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

  const organization = project.organization as unknown as { name: string } | null;

  return {
    id: project.id,
    name: project.name,
    logo_url: project.logo_url,
    start_date: project.start_date,
    end_date: project.end_date,
    created_by: project.created_by,
    organization_id: project.organization_id,
    organization_name: organization?.name ?? null,
    managers: managers.get(id) ?? [],
    members: (members ?? []).map(
      (m) => m.profiles as unknown as { id: string; full_name: string | null; role: string },
    ),
  };
}
