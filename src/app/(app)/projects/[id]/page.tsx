import { notFound } from "next/navigation";
import { CalendarDays, FolderKanban, ListChecks } from "lucide-react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { getCurrentProfile } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getProjectWorkspaceData } from "@/lib/tasks";
import { CloneProjectButton } from "./clone-project-button";
import { ProjectWorkspace } from "./project-workspace";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, workspace, profile] = await Promise.all([
    getProject(id),
    getProjectWorkspaceData(id),
    getCurrentProfile(),
  ]);

  if (!project) notFound();

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <FadeIn>
      <Card className="gap-4 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-xl" size="lg">
              {project.logo_url && (
                <AvatarImage src={project.logo_url} className="rounded-xl" />
              )}
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-accent-foreground/70 text-primary-foreground">
                <FolderKanban className="size-6" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Managed by {project.manager?.full_name ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AvatarGroup>
              {project.members.slice(0, 5).map((member) => (
                <Avatar key={member.id} className="size-8 ring-2 ring-background">
                  <AvatarFallback className="text-xs">
                    {initials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
            {project.members.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{project.members.length - 5} more
              </span>
            )}
            {canManage && <CloneProjectButton projectId={project.id} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Started {formatDate(project.start_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Tentative end {formatDate(project.end_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <ListChecks className="size-3.5" />
            {project.members.length} member{project.members.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>
      </FadeIn>

      <ProjectWorkspace
        projectId={project.id}
        projectName={project.name}
        initialCategories={workspace.categories}
        initialTasks={workspace.tasks}
        statuses={workspace.statuses}
        members={workspace.members}
        initialCommentCounts={workspace.commentCounts}
        initialLabels={workspace.labels}
        canManage={canManage}
      />
    </div>
  );
}
