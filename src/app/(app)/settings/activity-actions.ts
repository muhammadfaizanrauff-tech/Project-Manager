"use server";

import type { AuditEntry } from "@/lib/audit-labels";
import { listAuditForActor } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/auth";

/**
 * Read someone else's activity log. Admin only — a Manager asking for a
 * member's log gets nothing back, which is the whole point of the feature:
 * the log belongs to the account holder, and only the Admin sits above that.
 */
export async function fetchAuditForUser(
  userId: string,
): Promise<{ entries?: AuditEntry[]; error?: string }> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") {
    return { error: "Only the Admin can read another account's activity." };
  }
  const entries = await listAuditForActor(userId);
  return { entries };
}
