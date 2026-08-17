import { Card } from "@/components/ui/card";
import { EmptyIllustration } from "@/components/empty-illustration";
import { FadeIn } from "@/components/motion/fade-in";
import { HelpTip } from "@/components/help-tip";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { listFavoriteProjectIds } from "@/lib/favorites";
import { defaultFolderForUser, listFolders } from "@/lib/folders";
import { defaultOrganizationForUser, listOrganizations } from "@/lib/organizations";
import { listAssignablePeopleWithOrgs, listProjects } from "@/lib/projects";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectsGrid } from "./projects-grid";

export default async function ProjectsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  // Anyone can create a project; only Admins/Managers can staff it with
  // other people, so members never see the manager/members pickers.
  const canAssignPeople = profile?.role === "admin" || profile?.role === "manager";
  const isAdmin = profile?.role === "admin";

  const [
    projects,
    people,
    organizations,
    favoriteIds,
    defaultOrganization,
    folders,
    defaultFolder,
  ] = await Promise.all([
    listProjects(),
    canAssignPeople ? listAssignablePeopleWithOrgs() : Promise.resolve([]),
    canAssignPeople ? listOrganizations() : Promise.resolve([]),
    user ? listFavoriteProjectIds(user.id) : Promise.resolve([]),
    // Members get no organization picker — their project is filed for them,
    // so the dialog names the organization it's going into instead.
    !canAssignPeople && user
      ? defaultOrganizationForUser(user.id)
      : Promise.resolve(null),
    // Everyone gets the folder list: members don't pick a folder when creating,
    // but they still filter and browse by one.
    listFolders(),
    // Whichever folder this person's work already lives in — the picker opens
    // on it, and a member's project is filed into it without being asked.
    user ? defaultFolderForUser(user.id) : Promise.resolve(null),
  ]);

  // Counted here rather than in the grid so the heading can lead with it — an
  // overdue project is the one thing on this page worth interrupting someone for.
  const now = new Date();
  const overdueCount = projects.filter(
    (project) => project.end_date && new Date(project.end_date) < now,
  ).length;
  const openTasks = projects.reduce(
    (sum, project) => sum + (project.task_total - project.task_done),
    0,
  );

  return (
    <div className="flex flex-1 flex-col gap-5">
      <FadeIn className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Projects
            <HelpTip topic="project-visibility" side="right">
              You only see projects you&apos;ve been assigned to — as a manager, a member, or
              because you created it. There is no default view of anyone else&apos;s work.
            </HelpTip>
          </h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0 ? (
              "No projects yet."
            ) : (
              <>
                {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
                {openTasks} task{openTasks === 1 ? "" : "s"} open
                {overdueCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-destructive">
                      {overdueCount} overdue
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <NewProjectDialog
          people={people}
          organizations={organizations}
          folders={folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            organization_id: folder.organization_id,
          }))}
          defaultFolderId={defaultFolder?.id ?? null}
          defaultFolderName={defaultFolder?.name ?? null}
          canAssignPeople={canAssignPeople}
          isAdmin={isAdmin}
          defaultOrganizationName={defaultOrganization?.name ?? null}
        />
      </FadeIn>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-md border-dashed py-16 text-center">
          <EmptyIllustration className="h-28 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {canAssignPeople
              ? "No projects assigned to you yet. Create one, or ask to be added to an existing project."
              : "No projects assigned to you yet. A manager needs to add you to one before it appears here."}
          </p>
        </Card>
      ) : (
        <ProjectsGrid
          projects={projects}
          favoriteIds={favoriteIds}
          folders={folders}
          canManageFolders={canAssignPeople}
        />
      )}
    </div>
  );
}
