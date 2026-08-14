import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type Organization = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
};

export type OrganizationPerson = {
  id: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
};

export type OrganizationDetail = Organization & {
  members: OrganizationPerson[];
  project_count: number;
};

/**
 * Organizations the signed-in user belongs to. RLS already limits the table to
 * the caller's own organizations (the Admin sees all of them), so no extra
 * filtering is needed here.
 */
export async function listOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, description, logo_url, created_at")
    .order("name");
  return data ?? [];
}

export async function listOrganizationsWithMembers(): Promise<OrganizationDetail[]> {
  const supabase = await createClient();

  const [{ data: orgs }, { data: memberRows }, { data: projectRows }] = await Promise.all([
    supabase.from("organizations").select("id, name, description, logo_url, created_at").order("name"),
    supabase
      .from("organization_members")
      .select("org_id, profiles:user_id(id, full_name, role)"),
    supabase.from("projects").select("id, organization_id"),
  ]);

  const membersByOrg = new Map<string, OrganizationPerson[]>();
  for (const row of memberRows ?? []) {
    const person = row.profiles as unknown as OrganizationPerson | null;
    if (!person) continue;
    const list = membersByOrg.get(row.org_id) ?? [];
    list.push(person);
    membersByOrg.set(row.org_id, list);
  }

  const projectCounts = new Map<string, number>();
  for (const row of projectRows ?? []) {
    if (!row.organization_id) continue;
    projectCounts.set(row.organization_id, (projectCounts.get(row.organization_id) ?? 0) + 1);
  }

  const roleRank = { admin: 0, manager: 1, member: 2 } as const;

  return (orgs ?? []).map((org) => ({
    ...org,
    members: (membersByOrg.get(org.id) ?? []).sort(
      (a, b) =>
        roleRank[a.role] - roleRank[b.role] ||
        (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    ),
    project_count: projectCounts.get(org.id) ?? 0,
  }));
}

/** Organization ids the given user belongs to. Uses the service client so it
 *  works while deciding what a *different* user is allowed to see. */
export async function orgIdsForUser(userId: string): Promise<string[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.org_id);
}

/** Every Admin, regardless of organization. Admins sit above the tenancy
 *  boundary, so when they're allowed into a list at all they're always in it. */
export async function listAdmins(): Promise<OrganizationPerson[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "admin")
    .order("full_name");
  return (data ?? []) as OrganizationPerson[];
}

/**
 * Everyone the given user is allowed to see and work with.
 *
 * - Admin: everybody.
 * - Anyone else: every user sharing at least one of their organizations.
 *
 * This is the single source of truth behind the project staffing pickers, the
 * Settings → Users list, and who a Manager may switch into. Service client on
 * purpose: it's also called to validate a request server-side, where relying
 * on the caller's own RLS view would be circular.
 *
 * `includeAdmins` is what separates the two kinds of caller. Impersonation and
 * the Settings → Users list must never offer an Admin to a Manager, so they
 * take the default. Staffing a project is the opposite case — an Admin needs to
 * be assignable as a project manager, member or task assignee by anyone — so
 * `listAssignablePeopleWithOrgs` opts in, and gets every Admin appended whether
 * or not they happen to share an organization with the caller.
 */
export async function visiblePeopleForUser(
  userId: string,
  role: "admin" | "manager" | "member",
  { includeAdmins = false }: { includeAdmins?: boolean } = {},
): Promise<OrganizationPerson[]> {
  const service = createServiceClient();

  if (role === "admin") {
    const { data } = await service
      .from("profiles")
      .select("id, full_name, role")
      .order("full_name");
    return (data ?? []) as OrganizationPerson[];
  }

  const orgIds = await orgIdsForUser(userId);

  let people: OrganizationPerson[] = [];
  if (orgIds.length > 0) {
    const { data: memberRows } = await service
      .from("organization_members")
      .select("user_id")
      .in("org_id", orgIds);

    const ids = Array.from(new Set((memberRows ?? []).map((r) => r.user_id)));
    if (ids.length > 0) {
      const { data } = await service
        .from("profiles")
        .select("id, full_name, role")
        .in("id", ids)
        .order("full_name");
      people = (data ?? []) as OrganizationPerson[];
    }
  }

  // The Admin is a member of organizations for bookkeeping reasons but is
  // never switchable by anyone else, so they're dropped unless a caller that
  // only needs them as an assignment target asks for them back.
  const withoutAdmins = people.filter((p) => p.role !== "admin");
  if (!includeAdmins) return withoutAdmins;

  const admins = await listAdmins();
  return [...admins, ...withoutAdmins];
}

export type DefaultOrganization = {
  id: string;
  name: string;
  /** False only in the last-resort case below, where the workspace's own
   *  organization is used for someone who isn't in any. */
  isMember: boolean;
};

/**
 * Where a project goes when nobody picked an organization for it.
 *
 * Members never see the organization picker, so their projects have to be
 * filed for them rather than refused. The answer is the oldest organization
 * they belong to — for almost everyone that's the "Main Organization"
 * schema-v10 created and put every existing user into, which is what makes
 * this behave like "it just goes in the main one".
 *
 * An account created without any organization (the Admin can do that from
 * Settings → Users) still shouldn't hit a dead end, so it falls back to the
 * workspace's oldest organization with `isMember: false` — the caller needs to
 * know, because RLS won't let that person write the column themselves.
 *
 * Service client because it answers "which organization is this user in",
 * which the caller's own RLS view can't be trusted to settle.
 */
export async function defaultOrganizationForUser(
  userId: string,
): Promise<DefaultOrganization | null> {
  const service = createServiceClient();

  const { data: mine } = await service
    .from("organization_members")
    .select("organizations:org_id(id, name, created_at)")
    .eq("user_id", userId);

  const owned = (mine ?? [])
    .map(
      (row) =>
        row.organizations as unknown as {
          id: string;
          name: string;
          created_at: string;
        } | null,
    )
    .filter((org): org is { id: string; name: string; created_at: string } => Boolean(org))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (owned.length > 0) {
    return { id: owned[0].id, name: owned[0].name, isMember: true };
  }

  const { data: oldest } = await service
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return oldest ? { id: oldest.id, name: oldest.name, isMember: false } : null;
}

/** True when both users share at least one organization. */
export async function sharesOrganization(a: string, b: string): Promise<boolean> {
  const [orgsA, orgsB] = await Promise.all([orgIdsForUser(a), orgIdsForUser(b)]);
  const setB = new Set(orgsB);
  return orgsA.some((id) => setB.has(id));
}
