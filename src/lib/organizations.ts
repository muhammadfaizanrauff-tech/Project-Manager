import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type Organization = {
  id: string;
  name: string;
  description: string | null;
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
    .select("id, name, description, created_at")
    .order("name");
  return data ?? [];
}

export async function listOrganizationsWithMembers(): Promise<OrganizationDetail[]> {
  const supabase = await createClient();

  const [{ data: orgs }, { data: memberRows }, { data: projectRows }] = await Promise.all([
    supabase.from("organizations").select("id, name, description, created_at").order("name"),
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
 */
export async function visiblePeopleForUser(
  userId: string,
  role: "admin" | "manager" | "member",
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
  if (orgIds.length === 0) return [];

  const { data: memberRows } = await service
    .from("organization_members")
    .select("user_id")
    .in("org_id", orgIds);

  const ids = Array.from(new Set((memberRows ?? []).map((r) => r.user_id)));
  if (ids.length === 0) return [];

  const { data } = await service
    .from("profiles")
    .select("id, full_name, role")
    .in("id", ids)
    .order("full_name");

  // The Admin is a member of organizations for bookkeeping reasons but is
  // never staffable or switchable by anyone else.
  return ((data ?? []) as OrganizationPerson[]).filter((p) => p.role !== "admin");
}

/** True when both users share at least one organization. */
export async function sharesOrganization(a: string, b: string): Promise<boolean> {
  const [orgsA, orgsB] = await Promise.all([orgIdsForUser(a), orgIdsForUser(b)]);
  const setB = new Set(orgsB);
  return orgsA.some((id) => setB.has(id));
}
