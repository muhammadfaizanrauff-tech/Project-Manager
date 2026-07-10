import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listManagedUsers } from "@/lib/users-admin";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  const role = profile?.role ?? "member";

  const supabase = await createClient();

  const [users, statuses, meetingLinksRes] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile{role !== "member" ? ", team, and workspace options" : ""}.
        </p>
      </div>

      <SettingsTabs
        role={role}
        profile={{
          fullName: profile?.full_name ?? "",
          email: user?.email ?? "",
        }}
        users={users}
        statuses={statuses.data ?? []}
        meetingLinks={meetingLinksRes.data ?? []}
      />
    </div>
  );
}
