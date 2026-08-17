import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultOrganizationForUser } from "@/lib/organizations";

/**
 * Does this error mean "the database hasn't run schema-v13.sql yet"?
 *
 * Schema files here are applied by hand, so there is a real window where the
 * deployed app knows about folders and Postgres doesn't. Supabase reports that
 * two different ways depending on the operation: Postgres' own codes (42P01 for
 * a missing table, 42703 for a missing column) when the statement reaches the
 * database, and PostgREST's schema-cache codes (PGRST204/PGRST205) when its
 * cached view of the schema rejects the request first. Both mean the same
 * thing to a user, so both get the same sentence.
 */
export function isFoldersSchemaMissing(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    (message.includes("folder") && message.includes("does not exist"))
  );
}

export const FOLDERS_SCHEMA_MISSING_MESSAGE =
  "The database hasn't been updated for folders yet — run schema-v13.sql in the Supabase SQL editor, then try again.";

export type Folder = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  name: string;
  position: number;
  is_default: boolean;
};

/**
 * Folders the signed-in user can see. RLS (schema-v13) already limits the table
 * to the organizations they belong to — the Admin sees all of them — so there's
 * no extra filtering here.
 *
 * The organization name comes along because an Admin, who spans organizations,
 * would otherwise be picking between three folders all called "General".
 */
export async function listFolders(): Promise<Folder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_folders")
    .select("id, organization_id, name, position, is_default, organizations:organization_id(name)")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => {
    const org = row.organizations as unknown as { name: string } | null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      organization_name: org?.name ?? null,
      name: row.name,
      position: row.position,
      is_default: row.is_default,
    };
  });
}

export type DefaultFolder = {
  id: string;
  name: string;
  organization_id: string;
};

/**
 * Which folder this person's next project should go in, when they aren't being
 * asked to choose.
 *
 * Members never see the folder picker — the same call the organization picker
 * makes (see `defaultOrganizationForUser`) — so their project has to be filed
 * for them rather than refused. Managers do see the picker, but it opens on
 * this answer instead of making them hunt for the obvious one.
 *
 * The order is "wherever your work already lives", then "your organization's
 * default":
 *
 *   1. The folder most of the projects already assigned to them sit in. This is
 *      the case worth getting right: someone whose six projects are all in
 *      "Client Work" means "Client Work" when they say nothing.
 *   2. Failing that (nobody has assigned them anything yet), the default folder
 *      of their own organization — the "General" every organization gets in
 *      schema-v13.
 *   3. Failing even that, the oldest folder in that organization, in case an
 *      Admin has since renamed or reorganized things.
 *
 * Service client on purpose: this answers "what is this *user's* situation",
 * which the caller's own RLS view can't settle — the same reason
 * `defaultOrganizationForUser` uses one.
 */
export async function defaultFolderForUser(userId: string): Promise<DefaultFolder | null> {
  const service = createServiceClient();

  // 1. Where their existing work is filed. Managed and staffed projects both
  //    count as "assigned to them"; the project they merely created does not,
  //    or a first-time creator would anchor on their own last guess forever.
  const [{ data: managed }, { data: staffed }] = await Promise.all([
    service.from("project_managers").select("project_id").eq("user_id", userId),
    service.from("project_members").select("project_id").eq("user_id", userId),
  ]);

  const projectIds = Array.from(
    new Set([
      ...(managed ?? []).map((r) => r.project_id),
      ...(staffed ?? []).map((r) => r.project_id),
    ]),
  );

  if (projectIds.length > 0) {
    const { data: rows } = await service
      .from("projects")
      .select("folder_id")
      .in("id", projectIds)
      .not("folder_id", "is", null);

    const tally = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!row.folder_id) continue;
      tally.set(row.folder_id, (tally.get(row.folder_id) ?? 0) + 1);
    }

    if (tally.size > 0) {
      // Sorted by count, then by id — a deterministic tiebreak beats "whichever
      // the Map happened to yield first" for something a person sees every day.
      const [folderId] = Array.from(tally.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0];

      const { data: folder } = await service
        .from("project_folders")
        .select("id, name, organization_id")
        .eq("id", folderId)
        .maybeSingle();

      if (folder) return folder as DefaultFolder;
    }
  }

  // 2/3. Their organization's default folder, or its oldest folder.
  const organization = await defaultOrganizationForUser(userId);
  if (!organization) return null;

  const { data: fallback } = await service
    .from("project_folders")
    .select("id, name, organization_id, is_default, created_at")
    .eq("organization_id", organization.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return fallback ? (fallback as DefaultFolder) : null;
}

/** Which organization a folder belongs to, or null if there's no such folder
 *  (including the case where the folders table doesn't exist yet). */
export async function folderOrganization(folderId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("project_folders")
    .select("organization_id")
    .eq("id", folderId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/** The folder a project belongs in given only its organization: that
 *  organization's default folder, or its oldest one if the default has been
 *  removed. Used when the chosen organization and the chosen folder disagree. */
export async function defaultFolderForOrganization(
  organizationId: string,
): Promise<DefaultFolder | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("project_folders")
    .select("id, name, organization_id, is_default, created_at")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? (data as DefaultFolder) : null;
}

/** Folder ids in organizations the given user belongs to — used server-side to
 *  check a submitted folder is one they're actually entitled to file into. */
export async function folderIdsForUser(userId: string): Promise<string[]> {
  const service = createServiceClient();

  const { data: orgs } = await service
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId);

  const orgIds = (orgs ?? []).map((r) => r.org_id);
  if (orgIds.length === 0) return [];

  const { data } = await service
    .from("project_folders")
    .select("id")
    .in("organization_id", orgIds);

  return (data ?? []).map((r) => r.id);
}
