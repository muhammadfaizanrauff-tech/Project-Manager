import { FadeIn } from "@/components/motion/fade-in";
import { HelpTip } from "@/components/help-tip";
import { listMyAudit } from "@/lib/audit";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { listImportBatches } from "@/lib/imports";
import { listOrganizationsWithMembers } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { listManagedUsers } from "@/lib/users-admin";
import type { DeleteRequestRow } from "./delete-requests-tab";
import type { PasswordRequestRow } from "./password-requests-tab";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  const role = profile?.role ?? "member";
  const isStaff = role === "admin" || role === "manager";

  const supabase = await createClient();

  const [
    users,
    statuses,
    meetingLinksRes,
    deleteRequestsRes,
    passwordRequestsRes,
    organizations,
    importBatches,
    auditEntries,
  ] = await Promise.all([
    isStaff && user
      ? listManagedUsers(user.id, role as "admin" | "manager")
      : Promise.resolve([]),
    role === "admin"
      ? supabase.from("statuses").select("id, label, color, position").order("position")
      : Promise.resolve({ data: [] }),
    supabase
      .from("meeting_links")
      .select("id, label, url, created_at")
      .is("project_id", null)
      .order("created_at"),
    role === "admin"
      ? supabase
          .from("delete_requests")
          .select("id, task_name, kind, created_at, project:project_id(id, name), requester:requested_by(full_name)")
          .eq("status", "pending")
          .order("created_at")
      : Promise.resolve({ data: [] }),
    role === "admin"
      ? supabase
          .from("password_change_requests")
          .select("id, created_at, user:user_id(id, full_name)")
          .eq("status", "pending")
          .order("created_at")
      : Promise.resolve({ data: [] }),
    role === "admin" ? listOrganizationsWithMembers() : Promise.resolve([]),
    isStaff ? listImportBatches() : Promise.resolve([]),
    // Everyone's own activity — RLS keeps this to the caller's own rows.
    listMyAudit(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <FadeIn>
        {/* No subtitle here any more — every tab now states what it's for in
            its own SettingsSection header, so a generic one just doubled up. */}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Settings
          <HelpTip topic="settings" side="right">
            Your profile and password, plus — depending on your role — organizations, users,
            workflow statuses, import history and pending requests.
          </HelpTip>
        </h1>
      </FadeIn>

      <SettingsTabs
        role={role}
        currentUserId={user?.id ?? ""}
        profile={{
          fullName: profile?.full_name ?? "",
          email: user?.email ?? "",
        }}
        users={users}
        statuses={statuses.data ?? []}
        meetingLinks={meetingLinksRes.data ?? []}
        deleteRequests={(deleteRequestsRes.data ?? []) as unknown as DeleteRequestRow[]}
        passwordRequests={(passwordRequestsRes.data ?? []) as unknown as PasswordRequestRow[]}
        organizations={organizations}
        importBatches={importBatches}
        auditEntries={auditEntries}
      />
    </div>
  );
}
