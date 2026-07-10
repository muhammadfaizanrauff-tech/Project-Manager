"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, FolderKanban, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { GlobalDashboardData } from "@/lib/dashboard";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning";
}) {
  return (
    <Card className="gap-1.5 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={tone === "warning" ? "size-3.5 text-red-500" : "size-3.5"} />
        {label}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </Card>
  );
}

export function GlobalDashboard({ data }: { data: GlobalDashboardData }) {
  const completion =
    data.totalTasks > 0 ? Math.round((data.totalDone / data.totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={data.totalProjects} icon={FolderKanban} />
        <StatCard label="Total tasks" value={data.totalTasks} icon={CheckCircle2} />
        <StatCard label="Completion" value={`${completion}%`} icon={CheckCircle2} />
        <StatCard
          label="Overdue tasks"
          value={data.totalOverdue}
          icon={AlertTriangle}
          tone={data.totalOverdue > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-3 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Projects overview</p>
          <div className="flex flex-col gap-2">
            {data.projects.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            )}
            {data.projects.map((p) => {
              const pct = p.taskTotal > 0 ? Math.round((p.taskDone / p.taskTotal) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3 " />
                    {p.memberCount}
                  </span>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {pct}% ({p.taskDone}/{p.taskTotal})
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>

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
                <Tooltip />
                <Bar dataKey="openTasks" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
