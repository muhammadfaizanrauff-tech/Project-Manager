"use client";

import { useState, useTransition } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActivityEntry, TimeLog } from "@/lib/task-extras";
import { deleteTimeLog, logTime, setEstimate } from "./task-extras-actions";

const ACTION_LABELS: Record<string, (meta: Record<string, unknown> | null) => string> = {
  created: () => "created this task",
  commented: () => "added a comment",
  subtask_added: (meta) => `added checklist item "${meta?.name ?? ""}"`,
  dependency_added: () => "added a blocking task",
  time_logged: (meta) => `logged ${meta?.minutes ?? 0} min`,
  field_changed: (meta) => `updated ${meta?.field ?? "a field"}`,
};

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function TaskActivityPanel({
  projectId,
  taskId,
  estimateMinutes,
  timeLogs,
  activity,
  onEstimateChange,
  onTimeLogsChange,
}: {
  projectId: string;
  taskId: string;
  estimateMinutes: number | null;
  timeLogs: TimeLog[];
  activity: ActivityEntry[];
  onEstimateChange: (minutes: number | null) => void;
  onTimeLogsChange: (logs: TimeLog[]) => void;
}) {
  const [minutesInput, setMinutesInput] = useState("");
  const [estimateInput, setEstimateInput] = useState(
    estimateMinutes ? String(estimateMinutes) : "",
  );
  const [, startTransition] = useTransition();

  const loggedTotal = timeLogs.reduce((sum, l) => sum + l.minutes, 0);

  function handleLogTime() {
    const minutes = parseInt(minutesInput, 10);
    if (!minutes || minutes <= 0) return;
    setMinutesInput("");
    startTransition(async () => {
      const result = await logTime(projectId, taskId, minutes);
      if (result.data) onTimeLogsChange([result.data as unknown as TimeLog, ...timeLogs]);
    });
  }

  function handleDeleteLog(logId: string) {
    onTimeLogsChange(timeLogs.filter((l) => l.id !== logId));
    startTransition(() => {
      deleteTimeLog(projectId, logId);
    });
  }

  function handleSetEstimate() {
    const minutes = estimateInput ? parseInt(estimateInput, 10) : null;
    onEstimateChange(minutes);
    startTransition(() => {
      setEstimate(projectId, taskId, minutes);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="size-3.5" />
          Time tracking
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Estimate:</span>
          <Input
            type="number"
            min={0}
            value={estimateInput}
            onChange={(e) => setEstimateInput(e.target.value)}
            onBlur={handleSetEstimate}
            placeholder="min"
            className="h-7 w-20 text-xs"
          />
          <span className="text-muted-foreground">
            · Logged: {formatMinutes(loggedTotal)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {timeLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between text-xs">
              <span>
                {formatMinutes(log.minutes)} — {log.user?.full_name ?? "Someone"}
              </span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{new Date(log.logged_at).toLocaleDateString("en-US")}</span>
                <button onClick={() => handleDeleteLog(log.id)} className="hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={minutesInput}
            onChange={(e) => setMinutesInput(e.target.value)}
            placeholder="Minutes"
            className="h-7 w-24 text-xs"
          />
          <Button size="sm" variant="outline" onClick={handleLogTime}>
            <Plus className="size-3.5" />
            Log time
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground">Activity</p>
        <div className="flex flex-col gap-2">
          {activity.length === 0 && (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          )}
          {activity.map((entry) => (
            <div key={entry.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {entry.actor?.full_name ?? "Someone"}
              </span>{" "}
              {ACTION_LABELS[entry.action]?.(entry.meta) ?? entry.action}
              <span className="ml-1.5">
                · {new Date(entry.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
