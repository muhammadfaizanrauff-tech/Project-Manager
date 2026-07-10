"use client";

import { useState, useTransition } from "react";
import { Ban, Link2, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DependencyRef, Label } from "@/lib/task-extras";
import type { TaskRecord } from "@/lib/tasks";
import { addDependency, createLabel, removeDependency, setTaskLabel } from "./task-extras-actions";

const LABEL_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#22c55e", "#0ea5e9", "#ef4444"];

export function TaskLinks({
  projectId,
  taskId,
  allTasks,
  labels,
  taskLabelIds,
  dependsOn,
  blocks,
  onLabelsChange,
  onTaskLabelIdsChange,
  onDependsOnChange,
}: {
  projectId: string;
  taskId: string;
  allTasks: TaskRecord[];
  labels: Label[];
  taskLabelIds: string[];
  dependsOn: DependencyRef[];
  blocks: DependencyRef[];
  onLabelsChange: (labels: Label[]) => void;
  onTaskLabelIdsChange: (ids: string[]) => void;
  onDependsOnChange: (refs: DependencyRef[]) => void;
}) {
  const [newLabelName, setNewLabelName] = useState("");
  const [, startTransition] = useTransition();

  const otherTasks = allTasks.filter(
    (t) => t.id !== taskId && !dependsOn.some((d) => d.id === t.id),
  );

  function toggleLabel(labelId: string) {
    const assign = !taskLabelIds.includes(labelId);
    onTaskLabelIdsChange(
      assign ? [...taskLabelIds, labelId] : taskLabelIds.filter((id) => id !== labelId),
    );
    startTransition(() => {
      setTaskLabel(projectId, taskId, labelId, assign);
    });
  }

  function handleCreateLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    const color = LABEL_COLORS[labels.length % LABEL_COLORS.length];
    setNewLabelName("");
    startTransition(async () => {
      const result = await createLabel(projectId, name, color);
      if (result.data) onLabelsChange([...labels, result.data as Label]);
    });
  }

  function handleAddDependency(dependsOnTaskId: string) {
    const task = otherTasks.find((t) => t.id === dependsOnTaskId);
    if (!task) return;
    onDependsOnChange([...dependsOn, { id: task.id, name: task.name, serial_no: task.serial_no }]);
    startTransition(() => {
      addDependency(projectId, taskId, dependsOnTaskId);
    });
  }

  function handleRemoveDependency(dependsOnTaskId: string) {
    onDependsOnChange(dependsOn.filter((d) => d.id !== dependsOnTaskId));
    startTransition(() => {
      removeDependency(projectId, taskId, dependsOnTaskId);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Labels</p>
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label) => {
            const active = taskLabelIds.includes(label.id);
            return (
              <button
                key={label.id}
                onClick={() => toggleLabel(label.id)}
                className="rounded-full px-2 py-0.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: active ? `${label.color}26` : "transparent",
                  color: active ? label.color : "var(--muted-foreground)",
                  border: `1px solid ${active ? label.color : "var(--border)"}`,
                }}
              >
                {label.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Plus className="size-3.5 text-muted-foreground" />
          <input
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateLabel()}
            placeholder="New label"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Ban className="size-3.5" />
          Blocked by
        </p>
        {dependsOn.length === 0 && (
          <p className="text-xs text-muted-foreground">Not blocked by anything.</p>
        )}
        {dependsOn.map((dep) => (
          <div key={dep.id} className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 text-sm">
            <span>#{dep.serial_no} {dep.name}</span>
            <button
              onClick={() => handleRemoveDependency(dep.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {otherTasks.length > 0 && (
          <Select value="" onValueChange={(v) => v && handleAddDependency(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Add a blocking task…" />
            </SelectTrigger>
            <SelectContent>
              {otherTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  #{t.serial_no} {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 className="size-3.5" />
            Blocks
          </p>
          {blocks.map((dep) => (
            <Badge key={dep.id} variant="secondary" className="w-fit rounded-full">
              #{dep.serial_no} {dep.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
