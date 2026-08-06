"use client";

import {
  Activity,
  Building2,
  FileUp,
  KeyRound,
  Palette,
  Trash2,
  User,
  Users,
  Video,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuditEntry } from "@/lib/audit-labels";
import type { ImportBatch } from "@/lib/imports";
import type { OrganizationDetail } from "@/lib/organizations";
import type { ManagedUser } from "@/lib/users-admin";
import { ActivityTab } from "./activity-tab";
import { DeleteRequestsTab, type DeleteRequestRow } from "./delete-requests-tab";
import { ImportsTab } from "./imports-tab";
import { MeetingLinksTab } from "./meeting-links-tab";
import { OrganizationsTab } from "./organizations-tab";
import { PasswordRequestsTab, type PasswordRequestRow } from "./password-requests-tab";
import { ProfileTab } from "./profile-tab";
import { StatusesTab } from "./statuses-tab";
import { UsersTab } from "./users-tab";

export function SettingsTabs({
  role,
  currentUserId,
  profile,
  users,
  statuses,
  meetingLinks,
  deleteRequests,
  passwordRequests,
  organizations,
  importBatches,
  auditEntries,
}: {
  role: string;
  currentUserId: string;
  profile: { fullName: string; email: string };
  users: ManagedUser[];
  statuses: { id: string; label: string; color: string; position: number }[];
  meetingLinks: { id: string; label: string; url: string }[];
  deleteRequests: DeleteRequestRow[];
  passwordRequests: PasswordRequestRow[];
  organizations: OrganizationDetail[];
  importBatches: ImportBatch[];
  auditEntries: AuditEntry[];
}) {
  const canManageUsers = role === "admin" || role === "manager";
  const isAdmin = role === "admin";

  return (
    <Tabs defaultValue="profile">
      {/* Up to nine tabs. Wrapping them on a phone builds a five-row block that
          pushes the actual settings off-screen, so below sm they scroll
          sideways as one strip instead. */}
      <TabsList className="no-scrollbar h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-muted/60 p-1 [&>*]:shrink-0 sm:flex-wrap">
        {/* Ordered in three runs — yours, then the workspace you administer,
            then the queues waiting on your approval. The old order interleaved
            all three, so the strip read as nine unrelated items. */}
        <TabsTrigger value="profile" className="gap-1.5">
          <User className="size-3.5" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="activity" className="gap-1.5">
          <Activity className="size-3.5" />
          My Activity
        </TabsTrigger>

        {isAdmin && (
          <TabsTrigger value="organizations" className="gap-1.5">
            <Building2 className="size-3.5" />
            Organizations
          </TabsTrigger>
        )}
        {canManageUsers && (
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-3.5" />
            Users
          </TabsTrigger>
        )}
        {role === "admin" && (
          <TabsTrigger value="statuses" className="gap-1.5">
            <Palette className="size-3.5" />
            Statuses
          </TabsTrigger>
        )}
        <TabsTrigger value="meetings" className="gap-1.5">
          <Video className="size-3.5" />
          Meeting Links
        </TabsTrigger>

        {canManageUsers && (
          <TabsTrigger value="imports" className="gap-1.5">
            <FileUp className="size-3.5" />
            Import History
            {importBatches.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {importBatches.length}
              </span>
            )}
          </TabsTrigger>
        )}
        {role === "admin" && (
          <TabsTrigger value="delete-requests" className="gap-1.5">
            <Trash2 className="size-3.5" />
            Delete Requests
            {deleteRequests.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {deleteRequests.length}
              </span>
            )}
          </TabsTrigger>
        )}
        {role === "admin" && (
          <TabsTrigger value="password-requests" className="gap-1.5">
            <KeyRound className="size-3.5" />
            Password Requests
            {passwordRequests.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {passwordRequests.length}
              </span>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="profile" className="pt-4">
        <ProfileTab role={role} fullName={profile.fullName} email={profile.email} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="organizations" className="pt-4">
          <OrganizationsTab
            organizations={organizations}
            people={users.map((u) => ({ id: u.id, full_name: u.full_name, role: u.role }))}
          />
        </TabsContent>
      )}

      {canManageUsers && (
        <TabsContent value="users" className="pt-4">
          <UsersTab
            role={role as "admin" | "manager"}
            currentUserId={currentUserId}
            users={users}
            organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
          />
        </TabsContent>
      )}

      <TabsContent value="activity" className="pt-4">
        <ActivityTab
          entries={auditEntries}
          isAdmin={isAdmin}
          people={users
            .filter((u) => u.id !== currentUserId)
            .map((u) => ({ id: u.id, full_name: u.full_name, role: u.role }))}
        />
      </TabsContent>

      {canManageUsers && (
        <TabsContent value="imports" className="pt-4">
          <ImportsTab batches={importBatches} />
        </TabsContent>
      )}

      {role === "admin" && (
        <TabsContent value="statuses" className="pt-4">
          <StatusesTab statuses={statuses} />
        </TabsContent>
      )}

      {role === "admin" && (
        <TabsContent value="delete-requests" className="pt-4">
          <DeleteRequestsTab requests={deleteRequests} />
        </TabsContent>
      )}

      {role === "admin" && (
        <TabsContent value="password-requests" className="pt-4">
          <PasswordRequestsTab requests={passwordRequests} />
        </TabsContent>
      )}

      <TabsContent value="meetings" className="pt-4">
        <MeetingLinksTab links={meetingLinks} canManage={canManageUsers} />
      </TabsContent>
    </Tabs>
  );
}
