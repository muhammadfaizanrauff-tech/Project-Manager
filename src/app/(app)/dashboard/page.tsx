import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyIllustration } from "@/components/empty-illustration";
import { HelpTip } from "@/components/help-tip";
import { getCurrentProfile } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { GlobalDashboard } from "./global-dashboard";
import { GlobalImportDialog } from "./global-import-dialog";

const ROLE_BLURB: Record<string, string> = {
  admin: "Everything across every organization and project.",
  manager: "The projects you manage and the work happening inside them.",
  member: "The projects you're on and the work assigned to you.",
};

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const role = profile?.role ?? "member";
  const canImport = role === "admin" || role === "manager";

  // One dashboard for everyone. RLS decides what the numbers cover: the whole
  // workspace for the Admin, assigned projects for everyone else — so a
  // Manager and a Member get the same bird's-eye view of their own slice
  // rather than the stub card this page used to show them.
  const data = await getDashboardData();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {role === "admin" ? "Global Dashboard" : "Dashboard"}
            <HelpTip topic="dashboard" side="right">
              A bird&apos;s-eye view of your work: how much is done, what&apos;s overdue,
              what&apos;s landing this week, who&apos;s carrying what, and what just happened.
              Every tile and chart is scoped to what you have access to.
            </HelpTip>
          </h1>
          <p className="text-sm text-muted-foreground">
            {ROLE_BLURB[role]}
            {profile?.full_name ? ` Signed in as ${profile.full_name}.` : ""}
          </p>
        </div>
        {canImport && <GlobalImportDialog />}
      </div>

      {data.totalProjects === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
          <EmptyIllustration className="h-28 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {canImport
              ? "No projects yet. Create one to start tracking work — you'll see progress, workload and deadlines here as it fills up."
              : "You're not on any projects yet. Once a manager assigns you to one, it'll show up here along with your tasks."}
          </p>
          {canImport && (
            <Button
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<Link href="/projects" />}
            >
              Go to Projects
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </Card>
      ) : (
        <GlobalDashboard data={data} />
      )}
    </div>
  );
}
