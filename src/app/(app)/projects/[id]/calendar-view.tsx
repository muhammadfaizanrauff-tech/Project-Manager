"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PriorityChip } from "@/components/task-chips";
import type { TaskRecord } from "@/lib/tasks";
import { updateTask } from "./task-actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function CalendarView({
  projectId,
  tasks,
  onOpenTask,
  onTasksChange,
}: {
  projectId: string;
  tasks: TaskRecord[];
  onOpenTask: (task: TaskRecord) => void;
  onTasksChange: (tasks: TaskRecord[]) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRecord[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const key = task.due_date;
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const today = toDateKey(new Date());

  function handleDrop(dateKey: string) {
    if (!dragTaskId) return;
    const task = tasks.find((t) => t.id === dragTaskId);
    if (!task || task.due_date === dateKey) {
      setDragTaskId(null);
      return;
    }
    onTasksChange(tasks.map((t) => (t.id === dragTaskId ? { ...t, due_date: dateKey } : t)));
    updateTask(projectId, dragTaskId, { due_date: dateKey });
    setDragTaskId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const d = new Date();
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          >
            Today
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border bg-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((date) => {
          const key = toDateKey(date);
          const dayTasks = tasksByDate.get(key) ?? [];
          const inMonth = date.getMonth() === cursor.getMonth();
          const isToday = key === today;

          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(key)}
              className={`flex min-h-24 flex-col gap-1 bg-card p-1.5 ${inMonth ? "" : "opacity-40"}`}
            >
              <span
                className={`w-fit rounded-full px-1.5 text-xs ${
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {date.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onClick={() => onOpenTask(task)}
                    className="cursor-grab truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                    title={task.name}
                  >
                    {task.name}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityChip priority="high" /> Drag a task onto another day to reschedule it.
      </div>
    </div>
  );
}
