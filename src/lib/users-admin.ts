import "server-only";
import { visiblePeopleForUser } from "@/lib/organizations";
import { createServiceClient } from "@/lib/supabase/service";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  created_at: string;
  organizations: string[];
  /** A Manager may only act on Members inside their own organizations. */
  manageable: boolean;
  /** Whether the viewer may sign in as this person. Never true for the Admin. */
  switchable: boolean;
};

/**
 * The Settings → Users list.
 *
 * The Admin sees everybody. A Manager sees only people who share one of their
 * organizations, and among those may only manage — reset, delete, switch into
 * — the Members. Fellow Managers appear so they can be assigned to projects,
 * but are read-only: a Manager cannot take over a peer's account.
 */
export async function listManagedUsers(
  viewerId: string,
  viewerRole: "admin" | "manager",
): Promise<ManagedUser[]> {
  const service = createServiceClient();

  const people = await visiblePeopleForUser(viewerId, viewerRole);
  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);

  const [{ data: authList }, { data: profileRows }, { data: orgRows }] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }),
    service.from("profiles").select("id, created_at").in("id", ids),
    service
      .from("organization_members")
      .select("user_id, organizations:org_id(name)")
      .in("user_id", ids),
  ]);

  const emailById = new Map(authList?.users.map((u) => [u.id, u.email ?? ""]));
  const createdById = new Map((profileRows ?? []).map((p) => [p.id, p.created_at]));

  const orgsByUser = new Map<string, string[]>();
  for (const row of orgRows ?? []) {
    const org = row.organizations as unknown as { name: string } | null;
    if (!org) continue;
    const list = orgsByUser.get(row.user_id) ?? [];
    list.push(org.name);
    orgsByUser.set(row.user_id, list);
  }

  return people
    .map((p) => {
      const isAdmin = p.role === "admin";
      const isSelf = p.id === viewerId;
      const manageable =
        viewerRole === "admin" ? !isSelf : p.role === "member";
      return {
        id: p.id,
        email: emailById.get(p.id) ?? "",
        full_name: p.full_name,
        role: p.role,
        created_at: createdById.get(p.id) ?? new Date(0).toISOString(),
        organizations: (orgsByUser.get(p.id) ?? []).sort(),
        manageable,
        switchable: !isAdmin && !isSelf && manageable,
      };
    })
    .sort(
      (a, b) =>
        a.role.localeCompare(b.role) || (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    );
}
