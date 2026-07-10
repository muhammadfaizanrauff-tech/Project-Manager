"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { FadeIn } from "@/components/motion/fade-in";
import { PRIORITY_STYLES } from "@/components/task-chips";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#22c55e",
};

export function ProjectDashboard({
  tasks,
  statuses,
  members,
}: {
  tasks: TaskRecord[];
  categories: CategoryRecord[];
  statuses: Status[];
  members: { id: string; full_name: string | null; role: string }[];
}) {
  const total = tasks.length;

  const statusCounts = useMemo(() => {
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    const counts = new Map<string, { label: string; color: string; count: number }>();
    for (const task of tasks) {
      const status = task.status_id ? statusById.get(task.status_id) : undefined;
      const key = status?.id ?? "none";
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else
        counts.set(key, {
          label: status?.label ?? "No status",
          color: status?.color ?? "#94a3b8",
          count: 1,
        });
    }
    return Array.from(counts.values());
  }, [tasks, statuses]);

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const task of tasks) counts[task.priority] += 1;
    return (["high", "medium", "low"] as const).map((key) => ({
      key,
      label: PRIORITY_STYLES[key].label,
      value: counts[key],
    }));
  }, [tasks]);

  const byAssignee = useMemo(() => {
    const nameById = new Map(members.map((m) => [m.id, m.full_name || "Unnamed"]));
    const counts = new Map<string, number>();
    for (const task of tasks) {
      const key = task.assignee_id ?? "unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([id, count]) => ({
      name: id === "unassigned" ? "Unassigned" : nameById.get(id) ?? "Unknown",
      count,
    }));
  }, [tasks, members]);

  const doneStatusIds = new Set(
    statuses.filter((s) => s.label === "Done").map((s) => s.id),
  );
  const doneCount = tasks.filter((t) => t.status_id && doneStatusIds.has(t.status_id)).length;
  const completion = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < today && !(t.status_id && doneStatusIds.has(t.status_id)),
  );

  const upcoming = tasks
    .filter((t) => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      const diff = (due.getTime() - today.getTime()) / 86_400_000;
      return diff >= 0 && diff <= 7;
    })
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <FadeIn y={12}>
        <Card className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Completion</p>
          <div className="relative flex size-24 items-center justify-center">
            <PieChart width={96} height={96}>
              <Pie
                data={[{ value: completion }, { value: 100 - completion }]}
                dataKey="value"
                innerRadius={34}
                outerRadius={46}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill="var(--primary)" />
                <Cell fill="var(--muted)" />
              </Pie>
            </PieChart>
            <span className="absolute text-lg font-semibold">
              <AnimatedNumber value={completion} suffix="%" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {doneCount}/{total} tasks done
          </p>
        </Card>
      </FadeIn>

      <FadeIn delay={0.05} y={12}>
        <Card className="h-full gap-3 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Status breakdown</p>
          <div className="flex flex-col gap-2">
            {statusCounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            )}
            {statusCounts.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1">{s.label}</span>
                <span className="text-muted-foreground">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1} y={12}>
        <Card className="h-full gap-3 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Priority breakdown</p>
          <div className="flex items-center justify-center">
            <PieChart width={140} height={140}>
              <Pie
                data={priorityCounts}
                dataKey="value"
                nameKey="label"
                innerRadius={30}
                outerRadius={55}
                stroke="none"
              >
                {priorityCounts.map((p) => (
                  <Cell key={p.key} fill={PRIORITY_COLORS[p.key]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </div>
          <div className="flex justify-center gap-3 text-xs text-muted-foreground">
            {priorityCounts.map((p) => (
              <span key={p.key} className="flex items-center gap-1">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[p.key] }}
                />
                {p.label} ({p.value})
              </span>
            ))}
          </div>
        </Card>
      </FadeIn>

      <FadeIn delay={0.15} y={12} className="md:col-span-2">
        <Card className="gap-3 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Tasks by assignee</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byAssignee}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                }}
              />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </FadeIn>

      <FadeIn delay={0.2} y={12}>
        <Card className="h-full gap-3 rounded-2xl p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="size-3.5 text-red-500" />
            Overdue ({overdue.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {overdue.length === 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Nothing overdue.
              </p>
            )}
            {overdue.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{t.name}</span>
                <span className="text-xs text-red-500">{t.due_date}</span>
              </div>
            ))}
          </div>
        </Card>
      </FadeIn>

      <FadeIn delay={0.25} y={12}>
        <Card className="h-full gap-3 rounded-2xl p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5" />
            Upcoming (7 days)
          </p>
          <div className="flex flex-col gap-1.5">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing due soon.</p>
            )}
            {upcoming.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.due_date}</span>
              </div>
            ))}
          </div>
        </Card>
      </FadeIn>
    </div>
  );
}
