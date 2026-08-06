"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BellOff,
  CheckCheck,
  FileUp,
  FolderPlus,
  MessageSquare,
  Trash2,
  UserPlus,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyIllustration } from "@/components/empty-illustration";
import type { NotificationRow } from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  comment: MessageSquare,
  assignment: UserPlus,
  status: Workflow,
  import: FileUp,
  project_member: FolderPlus,
  delete_request: Trash2,
};

const TYPE_TONES: Record<string, string> = {
  comment: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  assignment: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  status: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  import: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  project_member: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  delete_request: "bg-red-500/10 text-red-600 dark:text-red-300",
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [, startTransition] = useTransition();

  const unread = useMemo(() => items.filter((n) => !n.read_at), [items]);
  const shown = tab === "unread" ? unread : items;

  /**
   * Opening a notification does two things at once: marks it read, and takes
   * you to the exact task it was about. The optimistic local update means the
   * unread badge drops immediately rather than after the navigation settles.
   */
  function open(notification: NotificationRow) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === notification.id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
      ),
    );
    startTransition(async () => {
      await markNotificationRead(notification.id);
    });
    if (notification.link) router.push(notification.link);
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="unread">
              Unread
              {unread.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {unread.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {unread.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAll}>
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          {tab === "unread" && items.length > 0 ? (
            <>
              <CheckCheck className="size-8 text-emerald-500" />
              <p className="text-sm text-muted-foreground">
                All caught up. Switch to <strong>All</strong> to re-read older notifications.
              </p>
            </>
          ) : (
            <>
              <EmptyIllustration className="h-24 w-auto" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Nothing yet. You&apos;ll be notified here when someone comments on your tasks,
                assigns you work, changes a status you&apos;re responsible for, or adds you to a
                project.
              </p>
            </>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? BellOff;
            const tone = TYPE_TONES[n.type] ?? "bg-muted text-muted-foreground";
            const isUnread = !n.read_at;

            return (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] ${
                  isUnread ? "border-primary/25 bg-primary/[0.04]" : "bg-card"
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}
                >
                  <Icon className="size-4" />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium leading-snug">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relativeTime(n.created_at)}
                    </span>
                  </span>
                  {n.body && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">{n.body}</span>
                  )}
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {n.project_name && <span>{n.project_name}</span>}
                    {n.task_id && (
                      <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Open task
                        <ArrowRight className="size-3" />
                      </span>
                    )}
                  </span>
                </span>

                {isUnread && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                    aria-label="Unread"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
