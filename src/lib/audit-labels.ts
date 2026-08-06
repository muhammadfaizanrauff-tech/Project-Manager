/**
 * The client-safe half of the audit module.
 *
 * `src/lib/audit.ts` is `server-only` — it reaches for the service-role
 * Supabase client — so the types and the presentation helpers live here
 * instead, where the Activity tab (a Client Component) can import them
 * without dragging the service key's module graph into the browser bundle.
 */

export type AuditAction =
  | "task.create"
  | "task.update"
  | "task.status"
  | "task.assign"
  | "task.delete"
  | "task.bulk_update"
  | "task.bulk_delete"
  | "comment.create"
  | "comment.delete"
  | "subtask.create"
  | "subtask.toggle"
  | "subtask.delete"
  | "time.log"
  | "category.create"
  | "category.delete"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.clone"
  | "import.run"
  | "export.run"
  | "delete_request.create"
  | "delete_request.resolve"
  | "user.create"
  | "user.delete"
  | "password.change"
  | "organization.create"
  | "organization.update"
  | "organization.delete"
  | "auth.impersonate_start"
  | "auth.impersonate_end";

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: AuditAction | string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  project_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type AuditEntryWithActor = AuditEntry & {
  actor_name: string | null;
};

/** Human-readable label for an action code, used by the Activity tables. */
export const AUDIT_LABELS: Record<string, string> = {
  "task.create": "Created a task",
  "task.update": "Edited a task",
  "task.status": "Changed a task's status",
  "task.assign": "Changed a task's assignee",
  "task.delete": "Deleted a task",
  "task.bulk_update": "Bulk-edited tasks",
  "task.bulk_delete": "Bulk-deleted tasks",
  "comment.create": "Wrote a comment",
  "comment.delete": "Deleted a comment",
  "subtask.create": "Added a checklist item",
  "subtask.toggle": "Ticked a checklist item",
  "subtask.delete": "Removed a checklist item",
  "time.log": "Logged time",
  "category.create": "Created a category",
  "category.delete": "Deleted a category",
  "project.create": "Created a project",
  "project.update": "Edited a project",
  "project.delete": "Deleted a project",
  "project.clone": "Cloned a project",
  "import.run": "Imported tasks",
  "export.run": "Exported a report",
  "delete_request.create": "Requested a deletion",
  "delete_request.resolve": "Resolved a delete request",
  "user.create": "Created a user",
  "user.delete": "Deleted a user",
  "password.change": "Changed a password",
  "organization.create": "Created an organization",
  "organization.update": "Edited an organization",
  "organization.delete": "Deleted an organization",
  "auth.impersonate_start": "Switched into an account",
  "auth.impersonate_end": "Left a switched account",
};

/** Broad grouping used to colour-code and filter the Activity view. */
export function auditCategory(action: string): "create" | "update" | "delete" | "admin" {
  if (action.endsWith(".delete") || action.endsWith(".bulk_delete")) return "delete";
  if (
    action.startsWith("user.") ||
    action.startsWith("organization.") ||
    action.startsWith("password.") ||
    action.startsWith("auth.")
  ) {
    return "admin";
  }
  if (action.endsWith(".create") || action === "import.run" || action === "time.log") {
    return "create";
  }
  return "update";
}
