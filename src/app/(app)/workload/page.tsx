import { redirect } from "next/navigation";
import { AlertTriangle, Flame } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { getCurrentProfile } from "@/lib/auth";
import { getWorkloadData } from "@/lib/dashboard";

export default async function WorkloadPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/dashboard");
  }

  const rows = await getWorkloadData();
  const maxOpen = Math.max(1, ...rows.map((r) => r.openTasks));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold tracking-tight">Workload</h1>
        <p className="text-sm text-muted-foreground">
          Open tasks per person across every project — use this to balance work fairly.
        </p>
      </FadeIn>

      <FadeIn delay={0.05} className="flex flex-col gap-3">
        {rows.length === 0 && (
          <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
            No one has any tasks assigned yet.
          </Card>
        )}
        {rows.map((row) => (
          <Card key={row.userId} className="gap-3 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{row.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{row.role}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {row.highPriorityTasks > 0 && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <Flame className="size-3.5" />
                    {row.highPriorityTasks} high priority
                  </span>
                )}
                {row.overdueTasks > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" />
                    {row.overdueTasks} overdue
                  </span>
                )}
                <span className="font-semibold">{row.openTasks} open</span>
              </div>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent-foreground/70 transition-all duration-500"
                style={{ width: `${(row.openTasks / maxOpen) * 100}%` }}
              />
            </div>

            {row.projects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {row.projects.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {p.name} · {p.count}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </FadeIn>
    </div>
  );
}
