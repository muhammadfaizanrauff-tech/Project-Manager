"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";

/**
 * The unread badge in the header.
 *
 * Seeded server-side so the count is right on first paint, then kept live over
 * the same Realtime channel the rest of the app uses — a comment left on your
 * task shows up here without a refresh. Navigating also re-syncs the count,
 * which covers the case where you just read something on the notifications
 * page.
 */
export function NotificationBell({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const [unread, setUnread] = useState(initialUnread);
  const pathname = usePathname();

  // Re-sync to the server's count whenever a navigation brings a fresh one —
  // adjusting state during render rather than in an effect, which is the
  // supported way to derive from changed props without a second render pass.
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  const [syncKey, setSyncKey] = useState(`${pathname}:${initialUnread}`);
  if (syncKey !== `${pathname}:${initialUnread}`) {
    setSyncKey(`${pathname}:${initialUnread}`);
    setUnread(initialUnread);
  }

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setUnread((n) => n + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // The only update that happens is "marked read", and it only counts
          // when the row wasn't already read.
          const before = payload.old as { read_at: string | null } | null;
          const after = payload.new as { read_at: string | null };
          if (after.read_at && !before?.read_at) setUnread((n) => Math.max(0, n - 1));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            nativeButton={false}
            render={<Link href="/notifications" aria-label="Notifications" />}
          />
        }
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
      </TooltipContent>
    </Tooltip>
  );
}
