import { Bell, LayoutGrid } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/motion/fade-in";
import { HelpTip } from "@/components/help-tip";
import { getCurrentProfile } from "@/lib/auth";
import { listMyNotifications, listProjectEventBoard } from "@/lib/notifications";
import { AdminEventBoard } from "./admin-event-board";
import { NotificationList } from "./notification-list";

export default async function NotificationsPage() {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";

  // The Admin gets both: a per-project board of everything happening across
  // the workspace, and their own personal tab for the times they're the
  // assignee. Everyone else has the personal tab only.
  const [notifications, board] = await Promise.all([
    listMyNotifications(),
    isAdmin ? listProjectEventBoard() : Promise.resolve([]),
  ]);

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <FadeIn>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Notifications
          <HelpTip topic="notifications" side="right">
            Anything that needs your attention: comments on your tasks, work assigned to you,
            status changes on projects you run, and imports. Click one to jump straight to the
            task it&apos;s about. Notifications stay unread until you open them.
          </HelpTip>
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Every project's activity on one board, plus anything addressed to you personally."
            : unread > 0
              ? `${unread} unread.`
              : "You're all caught up."}
        </p>
      </FadeIn>

      {isAdmin ? (
        <Tabs defaultValue="board" className="min-w-0">
          <TabsList>
            <TabsTrigger value="board" className="gap-1.5">
              <LayoutGrid className="size-3.5" />
              Project board
            </TabsTrigger>
            <TabsTrigger value="mine" className="gap-1.5">
              <Bell className="size-3.5" />
              My notifications
              {unread > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {unread}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="min-w-0 pt-4">
            <AdminEventBoard columns={board} />
          </TabsContent>

          <TabsContent value="mine" className="pt-4">
            <NotificationList notifications={notifications} />
          </TabsContent>
        </Tabs>
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  );
}
