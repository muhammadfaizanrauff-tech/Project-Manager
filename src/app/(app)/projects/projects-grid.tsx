"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  FolderKanban,
  LayoutGrid,
  List,
  Search,
  Star,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaggerItem, StaggerList } from "@/components/motion/stagger-list";
import type { ProjectListItem } from "@/lib/projects";
import { toggleFavorite } from "./favorites-actions";

const DAY_MS = 86_400_000;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Midnight today, so a project due *today* is not yet late. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type DueTone = "late" | "soon" | "muted";

/**
 * A deadline means more as a distance than as a date — "4 days left" is what
 * makes someone act, where "Aug 21, 2026" has to be worked out first. Only
 * dates far enough out to be uninteresting are shown as dates; the exact one
 * stays in the element's tooltip either way.
 */
function dueStatus(endDate: string | null): { label: string; tone: DueTone } {
  if (!endDate) return { label: "No end date", tone: "muted" };
  const due = new Date(endDate);
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      startOfToday().getTime()) /
      DAY_MS,
  );
  if (days < 0) {
    const late = Math.abs(days);
    return { label: `${late} day${late === 1 ? "" : "s"} overdue`, tone: "late" };
  }
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { label: `${days} days left`, tone: "soon" };
  return { label: formatDate(endDate), tone: "muted" };
}

const DUE_TONE: Record<DueTone, string> = {
  late: "text-destructive font-medium",
  soon: "text-[#cb912f] dark:text-[#ffdc49] font-medium",
  muted: "text-muted-foreground",
};

/** Notion's tag colours. A project's letter-tile gets one of them as a wash
 *  rather than a gradient — the same `${colour}1f` background / solid
 *  foreground pairing the status chips use, which holds up in both themes. */
const LOGO_ACCENTS = ["#2383e2", "#d9730d", "#448361", "#6940a5", "#c14c8a"];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_ACCENTS[hash % LOGO_ACCENTS.length];
}

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function progressOf(project: ProjectListItem) {
  return project.task_total > 0
    ? Math.round((project.task_done / project.task_total) * 100)
    : 0;
}

function ProjectTile({ project, size = "md" }: { project: ProjectListItem; size?: "sm" | "md" }) {
  const accent = accentFor(project.id);
  return (
    <Avatar
      className={`${size === "sm" ? "size-7" : "size-9"} shrink-0 rounded-md`}
      size="lg"
    >
      {project.logo_url && <AvatarImage src={project.logo_url} className="rounded-md" />}
      <AvatarFallback
        className="rounded-md"
        style={{ backgroundColor: `${accent}1f`, color: accent }}
      >
        <FolderKanban className={size === "sm" ? "size-3.5" : "size-5"} />
      </AvatarFallback>
    </Avatar>
  );
}

function FavoriteButton({
  isFavorite,
  onToggle,
}: {
  isFavorite: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      // Kept visible once starred, but otherwise only on hover/focus — a grid of
      // twelve cards shouldn't read as a grid of twelve stars.
      className={`shrink-0 rounded-sm p-1 text-muted-foreground transition-opacity hover:text-amber-500 focus-visible:opacity-100 ${
        isFavorite ? "" : "sm:opacity-0 sm:group-hover/card:opacity-100"
      }`}
    >
      <Star className={`size-4 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`} />
    </button>
  );
}

/** Managers as overlapping initials rather than "Name +2" — three faces read
 *  faster than a truncated sentence, and the count still tells the truth. */
function PeopleSummary({ project }: { project: ProjectListItem }) {
  const shown = project.managers.slice(0, 3);
  const extra = project.managers.length - shown.length;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {shown.length > 0 ? (
        <span className="flex items-center -space-x-1.5">
          {shown.map((manager) => (
            <span
              key={manager.id}
              title={manager.full_name ?? "Unnamed"}
              className="grid size-5 shrink-0 place-items-center rounded-full border border-card bg-secondary text-[10px] font-semibold text-secondary-foreground"
            >
              {initials(manager.full_name)}
            </span>
          ))}
          {extra > 0 && (
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-card bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
              +{extra}
            </span>
          )}
        </span>
      ) : (
        <span className="truncate text-muted-foreground">No manager</span>
      )}
      <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
        <Users className="size-3.5" />
        {project.member_count}
      </span>
    </span>
  );
}

function ProgressBar({ project }: { project: ProjectListItem }) {
  const progress = progressOf(project);
  const complete = project.task_total > 0 && project.task_done === project.task_total;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        // Green only at 100%: a finished project shouldn't need reading to spot.
        className={`h-full rounded-full transition-all duration-500 ${
          complete ? "bg-[#448361] dark:bg-[#4dab9a]" : "bg-primary"
        }`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function TaskCount({ project }: { project: ProjectListItem }) {
  return (
    <span className="truncate tabular-nums text-muted-foreground">
      {project.task_total === 0
        ? "No tasks yet"
        : `${project.task_done} of ${project.task_total} tasks`}
    </span>
  );
}

/**
 * The card reads top to bottom as identity → progress → people and time, with
 * the deadline last because it's the thing you act on. The old "Active/Overdue"
 * chip is gone: it said the same thing as the due date twice, and one of them
 * had to be wrong.
 */
function ProjectCard({
  project,
  isFavorite,
  onToggleFavorite,
}: {
  project: ProjectListItem;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const due = dueStatus(project.end_date);

  return (
    <Link href={`/projects/${project.id}`} className="group/card block h-full">
      {/* Notion answers hover with grey, not with lift and shadow. */}
      <Card className="h-full gap-0 rounded-md p-0 shadow-none transition-colors duration-150 hover:bg-accent/40">
        <div className="flex items-start gap-3 p-4 pb-3">
          <ProjectTile project={project} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-tight">{project.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {project.organization_name ?? "No organization"}
            </p>
          </div>
          <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} />
        </div>

        <div className="flex flex-col gap-1.5 px-4">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <TaskCount project={project} />
            <span className="text-sm font-semibold tabular-nums">{progressOf(project)}%</span>
          </div>
          <ProgressBar project={project} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs">
          <PeopleSummary project={project} />
          <span
            className={`flex shrink-0 items-center gap-1 ${DUE_TONE[due.tone]}`}
            title={project.end_date ? formatDate(project.end_date) : undefined}
          >
            <CalendarDays className="size-3.5" />
            {due.label}
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** The same project as one line. Past a dozen projects the grid becomes a
 *  scrolling job — this scans instead, and puts progress in a column your eye
 *  can run straight down. */
function ProjectRow({
  project,
  isFavorite,
  onToggleFavorite,
}: {
  project: ProjectListItem;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const due = dueStatus(project.end_date);

  return (
    <Link href={`/projects/${project.id}`} className="group/card block">
      <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors duration-150 hover:bg-accent/40">
        <ProjectTile project={project} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{project.name}</p>
          {/* On a phone the row keeps only what identifies the project and the
              one number that matters; the rest returns from sm up. */}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="sm:hidden">
              {progressOf(project)}% · {due.label}
            </span>
            <span className="hidden sm:inline">
              {project.organization_name ?? "No organization"}
            </span>
          </p>
        </div>

        <div className="hidden w-36 shrink-0 flex-col gap-1 lg:flex">
          <ProgressBar project={project} />
          <span className="text-[11px]">
            <TaskCount project={project} />
          </span>
        </div>

        <span className="hidden w-10 shrink-0 text-right text-sm font-semibold tabular-nums sm:inline">
          {progressOf(project)}%
        </span>

        <span className="hidden shrink-0 text-xs sm:flex">
          <PeopleSummary project={project} />
        </span>

        <span
          className={`hidden w-28 shrink-0 items-center justify-end gap-1 text-xs sm:flex ${DUE_TONE[due.tone]}`}
          title={project.end_date ? formatDate(project.end_date) : undefined}
        >
          <CalendarDays className="size-3.5" />
          <span className="truncate">{due.label}</span>
        </span>

        <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} />
      </div>
    </Link>
  );
}

/** A two-or-three-way switch, built here because there's no toggle-group
 *  primitive in the project and a `Select` for two options is a click too many. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: {
    value: T;
    label?: string;
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex shrink-0 items-center gap-0.5 rounded-md border bg-muted/50 p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            title={option.title}
            className={`flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors ${
              active
                ? "bg-card text-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="size-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type Scope = "all" | "starred" | "late";
type Sort = "recent" | "name" | "progress" | "due";

export function ProjectsGrid({
  projects,
  favoriteIds,
}: {
  projects: ProjectListItem[];
  favoriteIds: string[];
}) {
  const [favorites, setFavorites] = useState(new Set(favoriteIds));
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [, startTransition] = useTransition();

  function toggle(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    const isFav = favorites.has(projectId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    startTransition(() => {
      toggleFavorite(projectId, !isFav);
    });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const today = startOfToday();

    const matches = projects.filter((project) => {
      if (scope === "starred" && !favorites.has(project.id)) return false;
      if (scope === "late") {
        if (!project.end_date || new Date(project.end_date) >= today) return false;
      }
      if (!needle) return true;
      // Searching the organization and the managers too, because "whose is
      // this" is as common a way to look for a project as its name.
      return (
        project.name.toLowerCase().includes(needle) ||
        (project.organization_name ?? "").toLowerCase().includes(needle) ||
        project.managers.some((m) => (m.full_name ?? "").toLowerCase().includes(needle))
      );
    });

    const sorted = [...matches];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "progress") {
      // Least done first: the useful end of this list is the work not finished.
      sorted.sort((a, b) => progressOf(a) - progressOf(b) || a.name.localeCompare(b.name));
    } else if (sort === "due") {
      // Projects with no end date can't be "soonest" — they go last rather
      // than sorting as if they were due at the epoch.
      sorted.sort((a, b) => {
        if (!a.end_date && !b.end_date) return a.name.localeCompare(b.name);
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return a.end_date.localeCompare(b.end_date);
      });
    } else {
      // Default keeps the server's newest-first order but floats starred
      // projects up, which is the only thing that makes starring one useful.
      sorted.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
    }
    return sorted;
  }, [projects, query, scope, sort, favorites]);

  const filtering = query.trim() !== "" || scope !== "all";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, people…"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Segmented
          ariaLabel="Which projects to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All", title: "Every project you're on" },
            { value: "starred", label: "Starred", title: "Only your favorites" },
            { value: "late", label: "Overdue", title: "Only projects past their end date" },
          ]}
        />

        <Select value={sort} onValueChange={(v) => setSort((v as Sort) ?? "recent")}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Starred, then newest</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="progress">Least done first</SelectItem>
            <SelectItem value="due">Due soonest</SelectItem>
          </SelectContent>
        </Select>

        <Segmented
          ariaLabel="Layout"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", title: "Cards", icon: LayoutGrid },
            { value: "list", title: "Compact list", icon: List },
          ]}
        />

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {filtering ? `${visible.length} of ${projects.length}` : `${projects.length}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 rounded-md border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {scope === "starred"
              ? "No starred projects yet — tap a star to pin one here."
              : scope === "late"
                ? "Nothing is overdue."
                : "No projects match that search."}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setScope("all");
              }}
              className="text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </Card>
      ) : (
        <StaggerList
          className={
            view === "grid"
              ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : "flex flex-col gap-1.5"
          }
        >
          {visible.map((project) => (
            <StaggerItem key={project.id}>
              {view === "grid" ? (
                <ProjectCard
                  project={project}
                  isFavorite={favorites.has(project.id)}
                  onToggleFavorite={(e) => toggle(e, project.id)}
                />
              ) : (
                <ProjectRow
                  project={project}
                  isFavorite={favorites.has(project.id)}
                  onToggleFavorite={(e) => toggle(e, project.id)}
                />
              )}
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  );
}
