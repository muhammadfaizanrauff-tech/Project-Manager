"use client";

import { useState } from "react";
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [tab, setTab] = useState("profile");

  // Declared once and rendered two ways. Ordered in three runs — yours, then
  // the workspace you administer, then the queues awaiting your approval.
  const tabs = [
    { value: "profile", label: "Profile", icon: User, show: true, count: 0 },
    { value: "activity", label: "My Activity", icon: Activity, show: true, count: 0 },

    { value: "organizations", label: "Organizations", icon: Building2, show: isAdmin, count: 0 },
    { value: "users", label: "Users", icon: Users, show: canManageUsers, count: 0 },
    { value: "statuses", label: "Statuses", icon: Palette, show: isAdmin, count: 0 },
    { value: "meetings", label: "Meeting Links", icon: Video, show: true, count: 0 },

    {
      value: "imports",
      label: "Import History",
      icon: FileUp,
      show: canManageUsers,
      count: importBatches.length,
    },
    {
      value: "delete-requests",
      label: "Delete Requests",
      icon: Trash2,
      show: isAdmin,
      count: deleteRequests.length,
    },
    {
      value: "password-requests",
      label: "Password Requests",
      icon: KeyRound,
      show: isAdmin,
      count: passwordRequests.length,
    },
  ].filter((t) => t.show);

  return (
    <Tabs value={tab} onValueChange={(v) => v && setTab(String(v))}>
      {/* Below sm this is a picker, not a tab strip. Nine tabs fit no strip a
          phone can show: wrapping them buried the settings under five rows of
          buttons, and scrolling them sideways collapsed the labels on top of
          each other, because TabsList pins itself to h-8 and nine tabs do not
          fit in 32px. A picker is one row at any width. */}
      <div className="sm:hidden">
        <Select value={tab} onValueChange={(v) => v && setTab(String(v))}>
          <SelectTrigger className="w-full" aria-label="Settings section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.count > 0 ? `${t.label} (${t.count})` : t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* group-data-horizontal/tabs:h-auto, not plain h-auto: the primitive
          sets its height through that same variant, which outranks an
          unprefixed utility. Without matching it the row stays 32px tall and
          any wrapped second row overlaps whatever sits below. */}
      <TabsList className="hidden w-full max-w-full flex-wrap justify-start gap-1 bg-muted/60 p-1 group-data-horizontal/tabs:h-auto sm:flex">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
            <t.icon className="size-3.5" />
            {t.label}
            {t.count > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {t.count}
              </span>
            )}
          </TabsTrigger>
        ))}
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

      {isAdmin && (
        <TabsContent value="statuses" className="pt-4">
          <StatusesTab statuses={statuses} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="delete-requests" className="pt-4">
          <DeleteRequestsTab requests={deleteRequests} />
        </TabsContent>
      )}

      {isAdmin && (
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
