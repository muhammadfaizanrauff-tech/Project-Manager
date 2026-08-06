import { Card } from "@/components/ui/card";
import { EmptyIllustration } from "@/components/empty-illustration";
import { FadeIn } from "@/components/motion/fade-in";
import { HelpTip } from "@/components/help-tip";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { listFavoriteProjectIds } from "@/lib/favorites";
import { listOrganizations } from "@/lib/organizations";
import { listAssignablePeopleWithOrgs, listProjects } from "@/lib/projects";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectsGrid } from "./projects-grid";

export default async function ProjectsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  // Anyone can create a project; only Admins/Managers can staff it with
  // other people, so members never see the manager/members pickers.
  const canAssignPeople = profile?.role === "admin" || profile?.role === "manager";
  const isAdmin = profile?.role === "admin";

  const [projects, people, organizations, favoriteIds] = await Promise.all([
    listProjects(),
    canAssignPeople ? listAssignablePeopleWithOrgs() : Promise.resolve([]),
    canAssignPeople ? listOrganizations() : Promise.resolve([]),
    user ? listFavoriteProjectIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <FadeIn className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Projects
            <HelpTip topic="project-visibility" side="right">
              You only see projects you&apos;ve been assigned to — as a manager, a member, or
              because you created it. There is no default view of anyone else&apos;s work.
            </HelpTip>
          </h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"} you're assigned to`}
          </p>
        </div>
        <NewProjectDialog
          people={people}
          organizations={organizations}
          canAssignPeople={canAssignPeople}
          isAdmin={isAdmin}
        />
      </FadeIn>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          <EmptyIllustration className="h-28 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {canAssignPeople
              ? "No projects assigned to you yet. Create one, or ask to be added to an existing project."
              : "No projects assigned to you yet. A manager needs to add you to one before it appears here."}
          </p>
        </Card>
      ) : (
        <ProjectsGrid projects={projects} favoriteIds={favoriteIds} />
      )}
    </div>
  );
}
