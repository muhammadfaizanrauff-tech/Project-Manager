"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, FolderKanban, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { FadeIn } from "@/components/motion/fade-in";
import type { GlobalDashboardData } from "@/lib/dashboard";

function StatCard({
  label,
  value,
  suffix = "",
  icon: Icon,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning";
  delay?: number;
}) {
  return (
    <FadeIn delay={delay} y={12}>
      <Card className="relative gap-1.5 overflow-hidden rounded-2xl p-5 shadow-sm">
        <div
          className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
            tone === "warning" ? "from-red-500 to-orange-500" : "from-primary to-accent-foreground/60"
          }`}
        />
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className={tone === "warning" ? "size-3.5 text-red-500" : "size-3.5 text-primary"} />
          {label}
        </div>
        <p className="text-3xl font-semibold tracking-tight">
          <AnimatedNumber value={value} suffix={suffix} />
        </p>
      </Card>
    </FadeIn>
  );
}

export function GlobalDashboard({ data }: { data: GlobalDashboardData }) {
  const completion =
    data.totalTasks > 0 ? Math.round((data.totalDone / data.totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={data.totalProjects} icon={FolderKanban} delay={0} />
        <StatCard label="Total tasks" value={data.totalTasks} icon={CheckCircle2} delay={0.05} />
        <StatCard label="Completion" value={completion} suffix="%" icon={CheckCircle2} delay={0.1} />
        <StatCard
          label="Overdue tasks"
          value={data.totalOverdue}
          icon={AlertTriangle}
          tone={data.totalOverdue > 0 ? "warning" : "default"}
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FadeIn delay={0.2} y={12}>
          <Card className="gap-3 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Projects overview</p>
            <div className="flex flex-col gap-1">
              {data.projects.length === 0 && (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              )}
              {data.projects.map((p) => {
                const pct = p.taskTotal > 0 ? Math.round((p.taskDone / p.taskTotal) * 100) : 0;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="flex-1 truncate font-medium group-hover:text-primary">
                      {p.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {p.memberCount}
                    </span>
                    <span className="flex w-28 items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                        {pct}%
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </FadeIn>

        <FadeIn delay={0.25} y={12}>
          <Card className="gap-3 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Workload — open tasks per person
            </p>
            {data.workload.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.workload.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                    }}
                  />
                  <Bar dataKey="openTasks" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
