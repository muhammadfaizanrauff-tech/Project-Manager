"use client";

import { Cell, Pie, PieChart } from "recharts";
import type { Status, TaskRecord } from "@/lib/tasks";

const COLORS = {
  done: "#16a34a",
  progress: "#94a3b8",
  blocked: "#ef4444",
};

export function CategoryDonut({
  tasks,
  statuses,
  size = 40,
}: {
  tasks: TaskRecord[];
  statuses: Status[];
  size?: number;
}) {
  const total = tasks.length;

  if (total === 0) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed text-[9px] text-muted-foreground"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  }

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  let done = 0;
  let blocked = 0;
  for (const task of tasks) {
    const label = task.status_id ? statusById.get(task.status_id)?.label : undefined;
    if (label === "Done") done += 1;
    else if (!label || label === "Not Started") blocked += 1;
  }
  const progress = total - done - blocked;
  const percent = Math.round((done / total) * 100);

  const data = [
    { key: "done", value: done, color: COLORS.done },
    { key: "progress", value: progress, color: COLORS.progress },
    { key: "blocked", value: blocked, color: COLORS.blocked },
  ].filter((d) => d.value > 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={size * 0.32}
          outerRadius={size * 0.5}
          startAngle={90}
          endAngle={-270}
          stroke="none"
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-semibold text-foreground">{percent}%</span>
      </div>
    </div>
  );
}
