"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, FolderKanban, Star, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StaggerItem, StaggerList } from "@/components/motion/stagger-list";
import type { ProjectListItem } from "@/lib/projects";
import { toggleFavorite } from "./favorites-actions";

function formatDate(value: string | null) {
  if (!value) return "No end date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const LOGO_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-fuchsia-500 to-pink-600",
  "from-sky-500 to-cyan-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
];

function gradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_GRADIENTS[hash % LOGO_GRADIENTS.length];
}

export function ProjectsGrid({
  projects,
  favoriteIds,
}: {
  projects: ProjectListItem[];
  favoriteIds: string[];
}) {
  const [favorites, setFavorites] = useState(new Set(favoriteIds));
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

  return (
    <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const progress =
          project.task_total > 0
            ? Math.round((project.task_done / project.task_total) * 100)
            : 0;
        const overdue = project.end_date && new Date(project.end_date) < new Date();
        const isFavorite = favorites.has(project.id);

        return (
          <StaggerItem key={project.id}>
            <Link href={`/projects/${project.id}`} className="block h-full">
              <Card className="h-full gap-3 rounded-2xl border-border/60 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 rounded-xl" size="lg">
                      {project.logo_url && (
                        <AvatarImage src={project.logo_url} className="rounded-xl" />
                      )}
                      <AvatarFallback
                        className={`rounded-xl bg-gradient-to-br text-white ${gradientFor(project.id)}`}
                      >
                        <FolderKanban className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-sm font-semibold leading-tight">
                        {project.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {project.manager?.full_name ?? "No manager assigned"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => toggle(e, project.id)}
                      className="text-muted-foreground hover:text-amber-500"
                    >
                      <Star
                        className={`size-4 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`}
                      />
                    </button>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        overdue
                          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      }`}
                    >
                      {overdue ? "Overdue" : "Active"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {project.member_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {formatDate(project.end_date)}
                  </span>
                </div>

                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent-foreground/70 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {progress}% complete · {project.task_done}/{project.task_total} tasks
                  </p>
                </div>
              </Card>
            </Link>
          </StaggerItem>
        );
      })}
    </StaggerList>
  );
}
