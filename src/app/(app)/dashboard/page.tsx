import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyIllustration } from "@/components/empty-illustration";
import { getCurrentProfile } from "@/lib/auth";
import { getGlobalDashboardData } from "@/lib/dashboard";
import { listProjects } from "@/lib/projects";
import { GlobalDashboard } from "./global-dashboard";
import { GlobalImportDialog } from "./global-import-dialog";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const canImport = profile?.role === "admin" || profile?.role === "manager";

  if (profile?.role === "admin") {
    const data = await getGlobalDashboardData();
    return (
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Global Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Overview across every project in the workspace.
            </p>
          </div>
          {canImport && <GlobalImportDialog />}
        </div>
        <GlobalDashboard data={data} />
      </div>
    );
  }

  const projects = await listProjects();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {profile
              ? `Signed in as ${profile.full_name ?? "you"} (${profile.role}).`
              : "You're signed in."}
          </p>
        </div>
        {canImport && <GlobalImportDialog />}
      </div>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          <EmptyIllustration className="h-28 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">
            No projects yet. Head to Projects to create your first one.
          </p>
          <Button
            size="sm"
            className="rounded-full"
            nativeButton={false}
            render={<Link href="/projects" />}
          >
            Go to Projects
            <ArrowRight className="size-3.5" />
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center justify-between rounded-2xl p-5 shadow-sm">
          <div>
            <p className="text-sm font-medium">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </p>
            <p className="text-sm text-muted-foreground">
              Open a project to see its dashboard tab for detailed analytics.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            nativeButton={false}
            render={<Link href="/projects" />}
          >
            View projects
            <ArrowRight className="size-3.5" />
          </Button>
        </Card>
      )}
    </div>
  );
}
