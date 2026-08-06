import { FadeIn } from "@/components/motion/fade-in";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listManagedUsers } from "@/lib/users-admin";
import type { DeleteRequestRow } from "./delete-requests-tab";
import type { PasswordRequestRow } from "./password-requests-tab";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  const role = profile?.role ?? "member";

  const supabase = await createClient();

  const [users, statuses, meetingLinksRes, deleteRequestsRes, passwordRequestsRes] = await Promise.all([
    role === "admin" || role === "manager"
      ? listManagedUsers(role)
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
          .select("id, task_name, created_at, project:project_id(id, name), requester:requested_by(full_name)")
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
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile{role !== "member" ? ", team, and workspace options" : ""}.
        </p>
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
      />
    </div>
  );
}
