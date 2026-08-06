"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Activity,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Trash2,
  PlusCircle,
  PencilLine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTip } from "@/components/help-tip";
// audit-labels rather than audit: this is a Client Component, and
// src/lib/audit.ts is server-only (it holds the service-role writer).
import { AUDIT_LABELS, auditCategory, type AuditEntry } from "@/lib/audit-labels";
import { fetchAuditForUser } from "./activity-actions";

const CATEGORY_STYLES: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  create: {
    icon: PlusCircle,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  update: {
    icon: PencilLine,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
  delete: { icon: Trash2, className: "bg-red-500/10 text-red-600 dark:text-red-300" },
  admin: {
    icon: ShieldCheck,
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
};

function describe(entry: AuditEntry) {
  const label = AUDIT_LABELS[entry.action] ?? entry.action;
  if (entry.entity_name) return `${label} — ${entry.entity_name}`;
  const count = (entry.meta as { count?: number } | null)?.count;
  if (count) return `${label} (${count})`;
  return label;
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const category = auditCategory(entry.action);
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.update;
  const Icon = style.icon;
  const status = (entry.meta as { status?: string } | null)?.status;

  return (
    <li className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${style.className}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug">{describe(entry)}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {entry.project_name && <span>{entry.project_name}</span>}
          {status && (
            <Badge variant="secondary" className="rounded-full border-none px-1.5 py-0 text-[10px] font-normal">
              {status}
            </Badge>
          )}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
        {new Date(entry.created_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    </li>
  );
}

function EntryList({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && auditCategory(e.action) !== category) return false;
      if (!q) return true;
      return [describe(e), e.project_name ?? "", e.action].join(" ").toLowerCase().includes(q);
    });
  }, [entries, query, category]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="create">Things created</SelectItem>
            <SelectItem value="update">Things changed</SelectItem>
            <SelectItem value="delete">Things deleted</SelectItem>
            <SelectItem value="admin">Account &amp; admin</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 rounded-2xl border-dashed py-12 text-center">
          <Activity className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {entries.length === 0
              ? "Nothing recorded yet. As you work, everything you do shows up here."
              : "Nothing matches those filters."}
          </p>
        </Card>
      ) : (
        <ul className="rounded-2xl border">
          {filtered.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Two modes in one tab.
 *
 * Everyone sees "My activity" — their own record of their own work. A
 * Manager cannot see this for the people they manage; that's deliberate, and
 * the notice below says so plainly so nobody assumes otherwise.
 *
 * The Admin additionally gets a picker to read anyone's log, which is the
 * oversight path. (Switching into an account gets the same view from the
 * inside.)
 */
export function ActivityTab({
  entries,
  isAdmin,
  people,
}: {
  entries: AuditEntry[];
  isAdmin: boolean;
  people: { id: string; full_name: string | null; role: string }[];
}) {
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [otherEntries, setOtherEntries] = useState<AuditEntry[]>([]);
  const [pending, startTransition] = useTransition();

  function chooseUser(id: string) {
    setSelectedUser(id);
    if (id === "me") return;
    startTransition(async () => {
      const result = await fetchAuditForUser(id);
      setOtherEntries(result.entries ?? []);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex max-w-2xl items-start gap-1.5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {isAdmin ? (
              <>
                Each person&apos;s own record of their work. As Admin you can read anyone&apos;s —{" "}
                <strong>managers cannot</strong>. A manager never sees their team&apos;s activity
                log, only their own.
              </>
            ) : (
              <>
                This is <strong>your private record</strong> of everything you&apos;ve done. Your
                manager cannot see it — only you and the Admin can.
              </>
            )}
            <HelpTip topic="audit" className="ml-1 align-text-bottom">
              The activity log records tasks you create and change, comments you write, time you
              log and files you import — with a timestamp on each. It&apos;s a record of your
              work, not a supervision tool.
            </HelpTip>
          </span>
        </p>

        {isAdmin && people.length > 0 && (
          <Select value={selectedUser} onValueChange={(v) => chooseUser(v ?? "me")}>
            <SelectTrigger className="h-8 w-56 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">My activity</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || "Unnamed"} ({p.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {pending ? (
        <Card className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading activity…
        </Card>
      ) : (
        <EntryList entries={selectedUser === "me" ? entries : otherEntries} />
      )}
    </div>
  );
}
