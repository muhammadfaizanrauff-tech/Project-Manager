"use client";

import { Palette, User, Users, Video } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ManagedUser } from "@/lib/users-admin";
import { MeetingLinksTab } from "./meeting-links-tab";
import { ProfileTab } from "./profile-tab";
import { StatusesTab } from "./statuses-tab";
import { UsersTab } from "./users-tab";

export function SettingsTabs({
  role,
  profile,
  users,
  statuses,
  meetingLinks,
}: {
  role: string;
  profile: { fullName: string; email: string };
  users: ManagedUser[];
  statuses: { id: string; label: string; color: string; position: number }[];
  meetingLinks: { id: string; label: string; url: string }[];
}) {
  const canManageUsers = role === "admin" || role === "manager";

  return (
    <Tabs defaultValue="profile">
      <TabsList className="h-auto flex-wrap gap-1 bg-muted/60 p-1">
        <TabsTrigger value="profile" className="gap-1.5">
          <User className="size-3.5" />
          Profile
        </TabsTrigger>
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
      </TabsList>

      <TabsContent value="profile" className="pt-4">
        <ProfileTab role={role} fullName={profile.fullName} email={profile.email} />
      </TabsContent>

      {canManageUsers && (
        <TabsContent value="users" className="pt-4">
          <UsersTab role={role as "admin" | "manager"} users={users} />
        </TabsContent>
      )}

      {role === "admin" && (
        <TabsContent value="statuses" className="pt-4">
          <StatusesTab statuses={statuses} />
        </TabsContent>
      )}

      <TabsContent value="meetings" className="pt-4">
        <MeetingLinksTab links={meetingLinks} canManage={canManageUsers} />
      </TabsContent>
    </Tabs>
  );
}
