import "server-only";
import { visiblePeopleForUser } from "@/lib/organizations";
import { createServiceClient } from "@/lib/supabase/service";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  created_at: string;
  avatar_url: string | null;
  /** Names, for display. */
  organizations: string[];
  /** Ids, so the edit dialog can pre-select the right ones. */
  organization_ids: string[];
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
    service.from("profiles").select("id, created_at, avatar_url").in("id", ids),
    service
      .from("organization_members")
      .select("user_id, org_id, organizations:org_id(name)")
      .in("user_id", ids),
  ]);

  const emailById = new Map(authList?.users.map((u) => [u.id, u.email ?? ""]));
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const orgsByUser = new Map<string, string[]>();
  const orgIdsByUser = new Map<string, string[]>();
  for (const row of orgRows ?? []) {
    const ids = orgIdsByUser.get(row.user_id) ?? [];
    ids.push(row.org_id);
    orgIdsByUser.set(row.user_id, ids);

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
        created_at: profileById.get(p.id)?.created_at ?? new Date(0).toISOString(),
        avatar_url: profileById.get(p.id)?.avatar_url ?? null,
        organizations: (orgsByUser.get(p.id) ?? []).sort(),
        organization_ids: orgIdsByUser.get(p.id) ?? [],
        manageable,
        switchable: !isAdmin && !isSelf && manageable,
      };
    })
    .sort(
      (a, b) =>
        a.role.localeCompare(b.role) || (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    );
}
