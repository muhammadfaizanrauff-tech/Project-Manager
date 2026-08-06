import "server-only";
import type { AuditAction, AuditEntry, AuditEntryWithActor } from "@/lib/audit-labels";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The account-scoped audit trail.
 *
 * Every entry belongs to the person who performed the action, and only that
 * person and the Admin can read it (see audit_log's RLS in schema-v10.sql).
 * A project's managers deliberately cannot: this is the account holder's own
 * record of their work, not a supervision feed.
 *
 * Writes go through the service-role client so an entry can't be forged or
 * suppressed from the browser, and they are fired with `void` from the
 * calling action — the same fire-and-forget pattern the email notifications
 * use, so logging never delays a mutation.
 */

export type {
  AuditAction,
  AuditEntry,
  AuditEntryWithActor,
} from "@/lib/audit-labels";
export { AUDIT_LABELS, auditCategory } from "@/lib/audit-labels";

export async function recordAudit(input: {
  actorId: string | null | undefined;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  meta?: Record<string, unknown>;
}) {
  if (!input.actorId) return;
  const service = createServiceClient();
  try {
    await service.from("audit_log").insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_name: input.entityName ?? null,
      project_id: input.projectId ?? null,
      project_name: input.projectName ?? null,
      meta: input.meta ?? null,
    });
  } catch (err) {
    // Never let a logging failure take a user's mutation down with it.
    console.error("[audit] could not record entry:", err);
  }
}

/** The signed-in user's own activity. RLS restricts this to them (or Admin). */
export async function listMyAudit(limit = 200): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("audit_log")
    .select(
      "id, actor_id, action, entity_type, entity_id, entity_name, project_id, project_name, meta, created_at",
    )
    .eq("actor_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AuditEntry[];
}

/**
 * Admin-only: anyone's activity. Guard the caller's role before calling —
 * this uses the service client so it can attach actor names for users the
 * caller might not otherwise resolve.
 */
export async function listAuditForActor(
  actorId: string,
  limit = 300,
): Promise<AuditEntryWithActor[]> {
  const service = createServiceClient();

  const [{ data }, { data: profile }] = await Promise.all([
    service
      .from("audit_log")
      .select(
        "id, actor_id, action, entity_type, entity_id, entity_name, project_id, project_name, meta, created_at",
      )
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false })
      .limit(limit),
    service.from("profiles").select("full_name").eq("id", actorId).maybeSingle(),
  ]);

  return ((data ?? []) as AuditEntry[]).map((entry) => ({
    ...entry,
    actor_name: profile?.full_name ?? null,
  }));
}
