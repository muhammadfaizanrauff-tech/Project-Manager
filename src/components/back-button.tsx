"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Back to wherever you were."
 *
 * Uses real browser history (router.back()), so it retraces the path you
 * actually took rather than guessing a parent route — arriving at a task from
 * a notification and pressing Back returns you to the notification list, not
 * to the project list.
 *
 * The one hazard with router.back() is walking off the top of the stack: open
 * a task link in a fresh tab and there is no previous page in this app to
 * return to, so "back" would leave the app entirely. We guard that with a
 * per-tab depth counter — sessionStorage, because that's exactly the scope of
 * a history stack. window.history.length is no use here: it counts entries
 * from other sites in the same tab and lies after a redirect.
 *
 * When the counter says there's nothing above us, the click falls back to the
 * dashboard rather than the button disappearing — a Back that always works
 * beats one that comes and goes.
 */
const DEPTH_KEY = "pm-nav-depth";
const HOME_PATH = "/dashboard";

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // Writing to sessionStorage is a side effect on an external store, not a
  // state sync — nothing here re-renders.
  useEffect(() => {
    const stored = Number(window.sessionStorage.getItem(DEPTH_KEY) ?? "0");
    const next = pathname === HOME_PATH ? 0 : stored + 1;
    window.sessionStorage.setItem(DEPTH_KEY, String(next));
  }, [pathname]);

  // The dashboard is the app's home; there's nothing above it.
  if (pathname === HOME_PATH) return null;

  function handleClick() {
    const depth = Number(window.sessionStorage.getItem(DEPTH_KEY) ?? "0");
    if (depth <= 1) {
      // Nothing of ours behind us — go home instead of off-site.
      window.sessionStorage.setItem(DEPTH_KEY, "0");
      router.push(HOME_PATH);
      return;
    }
    window.sessionStorage.setItem(DEPTH_KEY, String(depth - 2));
    router.back();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="-ml-1 gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
      aria-label="Go back to the previous page"
    >
      <ArrowLeft className="size-4" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
