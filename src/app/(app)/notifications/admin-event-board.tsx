"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CheckCheck,
  ChevronDown,
  ExternalLink,
  FileUp,
  FolderPlus,
  Inbox,
  MessageSquare,
  Search,
  Trash2,
  UserPlus,
  Workflow,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { HelpTip } from "@/components/help-tip";
import type { ProjectEventColumn, ProjectEventRow } from "@/lib/notifications";
import { markEventRead, markProjectEventsRead } from "./actions";

const TYPE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }
> = {
  comment: {
    icon: MessageSquare,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    label: "Comment",
  },
  assignment: {
    icon: UserPlus,
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    label: "Assignment",
  },
  status: {
    icon: Workflow,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    label: "Status",
  },
  import: {
    icon: FileUp,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    label: "Import",
  },
  project_member: {
    icon: FolderPlus,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    label: "Staffing",
  },
  delete_request: {
    icon: Trash2,
    tone: "bg-red-500/10 text-red-600 dark:text-red-300",
    label: "Delete request",
  },
};

function timestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCard({
  event,
  projectId,
  onRead,
}: {
  event: ProjectEventRow;
  projectId: string;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[event.type] ?? {
    icon: Inbox,
    tone: "bg-muted text-muted-foreground",
    label: event.type,
  };
  const Icon = meta.icon;
  const isUnread = !event.read_by_admin_at;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isUnread ? "border-primary/30 bg-primary/[0.04]" : "bg-card"
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
          <Icon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] font-medium leading-snug">{event.title}</span>
          <span className="text-[11px] text-muted-foreground">
            {event.actor_name ?? "Someone"} · {timestamp(event.created_at)}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="mt-2.5 flex flex-col gap-2 border-t pt-2.5">
          {event.body && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {event.body}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {meta.label}
            </span>
            {event.task_id && (
              <Link
                href={`/projects/${projectId}?task=${event.task_id}`}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Open the task
                <ExternalLink className="size-3" />
              </Link>
            )}
            {isUnread && (
              <button
                onClick={() => onRead(event.id)}
                className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Mark read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Admin's board: one column per project, every project shown even when
 * it's quiet, so a glance tells you which companies are moving and which have
 * gone silent. The Admin can't switch into their own account to read their
 * own notification tab, so this is where cross-project activity lives.
 */
export function AdminEventBoard({ columns }: { columns: ProjectEventColumn[] }) {
  const [board, setBoard] = useState(columns);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board
      .map((col) => ({
        ...col,
        events: col.events.filter((e) => {
          if (unreadOnly && e.read_by_admin_at) return false;
          if (!q) return true;
          return [e.title, e.body ?? "", e.actor_name ?? "", col.projectName]
            .join(" ")
            .toLowerCase()
            .includes(q);
        }),
      }))
      .filter((col) => {
        if (!q && !unreadOnly) return true;
        // While filtering, empty columns are noise rather than signal.
        return col.events.length > 0 || col.projectName.toLowerCase().includes(q);
      });
  }, [board, query, unreadOnly]);

  function readOne(projectId: string, eventId: string) {
    const now = new Date().toISOString();
    setBoard((prev) =>
      prev.map((col) =>
        col.projectId !== projectId
          ? col
          : {
              ...col,
              unreadCount: Math.max(0, col.unreadCount - 1),
              events: col.events.map((e) =>
                e.id === eventId ? { ...e, read_by_admin_at: now } : e,
              ),
            },
      ),
    );
    startTransition(async () => {
      await markEventRead(eventId);
    });
  }

  function readColumn(projectId: string) {
    const now = new Date().toISOString();
    setBoard((prev) =>
      prev.map((col) =>
        col.projectId !== projectId
          ? col
          : {
              ...col,
              unreadCount: 0,
              events: col.events.map((e) => ({ ...e, read_by_admin_at: e.read_by_admin_at ?? now })),
            },
      ),
    );
    startTransition(async () => {
      await markProjectEventsRead(projectId);
    });
  }

  const totalUnread = board.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={unreadOnly} onCheckedChange={() => setUnreadOnly((v) => !v)} />
          Unread only
        </label>
        <span className="text-xs text-muted-foreground">
          {totalUnread} unread across {board.length} project{board.length === 1 ? "" : "s"}
        </span>
        <HelpTip topic="admin-notifications">
          One column per project, newest activity first. Expand a card to read the detail, or jump
          straight to the task it refers to.
        </HelpTip>
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 rounded-2xl border-dashed py-16 text-center">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {board.length === 0
              ? "No projects yet, so there's no activity to show."
              : "Nothing matches those filters."}
          </p>
        </Card>
      ) : (
        <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-4">
          {visible.map((col) => (
            <div
              key={col.projectId}
              className="flex w-80 shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-muted/25 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/projects/${col.projectId}`}
                    className="block truncate text-sm font-semibold hover:text-primary"
                  >
                    {col.projectName}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {col.organizationName ?? "No organization"} · {col.events.length} event
                    {col.events.length === 1 ? "" : "s"}
                  </p>
                </div>
                {col.unreadCount > 0 && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {col.unreadCount}
                    </span>
                    <button
                      onClick={() => readColumn(col.projectId)}
                      title="Mark this project's activity as read"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <CheckCheck className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
                {col.events.length === 0 ? (
                  <p className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
                    Quiet — no activity here.
                  </p>
                ) : (
                  col.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      projectId={col.projectId}
                      onRead={(id) => readOne(col.projectId, id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
