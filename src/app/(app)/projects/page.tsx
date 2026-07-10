import Link from "next/link";
import { CalendarDays, FolderKanban, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { listAssignableProfiles, listProjects } from "@/lib/projects";
import { NewProjectDialog } from "./new-project-dialog";

function formatDate(value: string | null) {
  if (!value) return "No end date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  const canCreate = profile?.role === "admin" || profile?.role === "manager";

  const [projects, profiles] = await Promise.all([
    listProjects(),
    canCreate ? listAssignableProfiles() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canCreate && <NewProjectDialog profiles={profiles} />}
      </div>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-6" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canCreate
              ? "Create your first project to start organizing tasks."
              : "You haven't been assigned to any projects yet."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const progress =
              project.task_total > 0
                ? Math.round((project.task_done / project.task_total) * 100)
                : 0;
            const overdue =
              project.end_date && new Date(project.end_date) < new Date();

            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full gap-3 rounded-2xl border-border/60 p-5 shadow-sm transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10 rounded-xl" size="lg">
                        {project.logo_url && (
                          <AvatarImage src={project.logo_url} className="rounded-xl" />
                        )}
                        <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
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
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {progress}% complete · {project.task_done}/{project.task_total} tasks
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
