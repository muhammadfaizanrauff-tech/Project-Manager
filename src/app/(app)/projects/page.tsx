import { Card } from "@/components/ui/card";
import { EmptyIllustration } from "@/components/empty-illustration";
import { FadeIn } from "@/components/motion/fade-in";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { listFavoriteProjectIds } from "@/lib/favorites";
import { listAssignableProfiles, listProjects } from "@/lib/projects";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectsGrid } from "./projects-grid";

export default async function ProjectsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  const canCreate = profile?.role === "admin" || profile?.role === "manager";

  const [projects, profiles, favoriteIds] = await Promise.all([
    listProjects(),
    canCreate ? listAssignableProfiles() : Promise.resolve([]),
    user ? listFavoriteProjectIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <FadeIn className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canCreate && <NewProjectDialog profiles={profiles} />}
      </FadeIn>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          <EmptyIllustration className="h-28 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {canCreate
              ? "Create your first project to start organizing tasks."
              : "You haven't been assigned to any projects yet."}
          </p>
        </Card>
      ) : (
        <ProjectsGrid projects={projects} favoriteIds={favoriteIds} />
      )}
    </div>
  );
}
