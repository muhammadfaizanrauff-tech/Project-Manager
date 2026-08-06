import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * In-app notifications, built on two tables (schema-v10.sql):
 *
 *   project_events — one row per thing that happened, scoped to a project.
 *                    Feeds the Admin's per-project Kanban board.
 *   notifications  — one row per person who should hear about it.
 *                    Feeds each user's own notification tab.
 *
 * Recipients are worked out server-side with the service client, because
 * fanning out to a project's managers means reading rosters the *actor*
 * might not be allowed to read.
 */

export type EventType =
  | "comment"
  | "assignment"
  | "status"
  | "task_created"
  | "import"
  | "delete_request"
  | "project_member"
  | "mention";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  project_name: string | null;
};

export type ProjectEventRow = {
  id: string;
  project_id: string;
  task_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  type: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  read_by_admin_at: string | null;
  created_at: string;
};

export type ProjectEventColumn = {
  projectId: string;
  projectName: string;
  organizationName: string | null;
  unreadCount: number;
  events: ProjectEventRow[];
};

/** Deep link that opens a project with one task's detail drawer already open. */
export function taskLink(projectId: string, taskId?: string | null) {
  return taskId ? `/projects/${projectId}?task=${taskId}` : `/projects/${projectId}`;
}

/**
 * Record something that happened and notify the right people.
 *
 * `recipientIds` is de-duplicated and the actor is always removed — nobody
 * needs telling about their own comment.
 */
export async function publishEvent(input: {
  projectId: string;
  taskId?: string | null;
  actorId?: string | null;
  type: EventType;
  title: string;
  body?: string | null;
  meta?: Record<string, unknown>;
  recipientIds: (string | null | undefined)[];
}) {
  const service = createServiceClient();

  try {
    const { data: event } = await service
      .from("project_events")
      .insert({
        project_id: input.projectId,
        task_id: input.taskId ?? null,
        actor_id: input.actorId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        meta: input.meta ?? null,
      })
      .select("id")
      .single();

    const recipients = Array.from(
      new Set(input.recipientIds.filter((id): id is string => Boolean(id))),
    ).filter((id) => id !== input.actorId);

    if (recipients.length === 0) return;

    await service.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: taskLink(input.projectId, input.taskId),
        event_id: event?.id ?? null,
        project_id: input.projectId,
        task_id: input.taskId ?? null,
        actor_id: input.actorId ?? null,
      })),
    );
  } catch (err) {
    console.error("[notifications] could not publish event:", err);
  }
}

/**
 * Everyone who should hear about activity on a project: its assigned
 * managers, its staffed members, and the person who created it.
 */
export async function projectAudience(projectId: string): Promise<string[]> {
  const service = createServiceClient();
  const [{ data: managers }, { data: members }, { data: project }] = await Promise.all([
    service.from("project_managers").select("user_id").eq("project_id", projectId),
    service.from("project_members").select("user_id").eq("project_id", projectId),
    service.from("projects").select("created_by").eq("id", projectId).maybeSingle(),
  ]);

  return Array.from(
    new Set([
      ...(managers ?? []).map((r) => r.user_id),
      ...(members ?? []).map((r) => r.user_id),
      ...(project?.created_by ? [project.created_by] : []),
    ]),
  );
}

/** Just the people responsible for a project — managers, or its creator. */
export async function projectLeads(projectId: string): Promise<string[]> {
  const service = createServiceClient();
  const [{ data: managers }, { data: project }] = await Promise.all([
    service.from("project_managers").select("user_id").eq("project_id", projectId),
    service.from("projects").select("created_by").eq("id", projectId).maybeSingle(),
  ]);

  const ids = (managers ?? []).map((r) => r.user_id);
  if (ids.length === 0 && project?.created_by) ids.push(project.created_by);
  return Array.from(new Set(ids));
}

export async function listMyNotifications(limit = 100): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select(
      "id, type, title, body, link, read_at, created_at, project_id, task_id, actor_id, actor:actor_id(full_name), project:project_id(name)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const actor = row.actor as unknown as { full_name: string | null } | null;
    const project = row.project as unknown as { name: string } | null;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      read_at: row.read_at,
      created_at: row.created_at,
      project_id: row.project_id,
      task_id: row.task_id,
      actor_id: row.actor_id,
      actor_name: actor?.full_name ?? null,
      project_name: project?.name ?? null,
    };
  });
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

/**
 * The Admin's board: one column per project, newest events first.
 * Every project the Admin can see gets a column, including quiet ones — the
 * point is to show at a glance which projects are moving and which aren't.
 */
export async function listProjectEventBoard(limitPerProject = 40): Promise<ProjectEventColumn[]> {
  const supabase = await createClient();

  const [{ data: projects }, { data: events }, { data: orgs }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, organization_id")
      .order("name"),
    supabase
      .from("project_events")
      .select(
        "id, project_id, task_id, actor_id, type, title, body, meta, read_by_admin_at, created_at, actor:actor_id(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("organizations").select("id, name"),
  ]);

  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const byProject = new Map<string, ProjectEventRow[]>();
  for (const row of events ?? []) {
    const list = byProject.get(row.project_id) ?? [];
    if (list.length >= limitPerProject) continue;
    const actor = row.actor as unknown as { full_name: string | null } | null;
    list.push({
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      actor_id: row.actor_id,
      actor_name: actor?.full_name ?? null,
      type: row.type,
      title: row.title,
      body: row.body,
      meta: row.meta as Record<string, unknown> | null,
      read_by_admin_at: row.read_by_admin_at,
      created_at: row.created_at,
    });
    byProject.set(row.project_id, list);
  }

  return (projects ?? []).map((project) => {
    const list = byProject.get(project.id) ?? [];
    return {
      projectId: project.id,
      projectName: project.name,
      organizationName: project.organization_id
        ? orgNameById.get(project.organization_id) ?? null
        : null,
      unreadCount: list.filter((e) => !e.read_by_admin_at).length,
      events: list,
    };
  });
}
