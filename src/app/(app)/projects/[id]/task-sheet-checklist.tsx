"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Subtask } from "@/lib/task-extras";
import { addSubtask, deleteSubtask, toggleSubtask } from "./task-extras-actions";

export function TaskChecklist({
  projectId,
  taskId,
  subtasks,
  onChange,
}: {
  projectId: string;
  taskId: string;
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
}) {
  const [name, setName] = useState("");
  const [, startTransition] = useTransition();

  const done = subtasks.filter((s) => s.is_done).length;
  const pct = subtasks.length > 0 ? Math.round((done / subtasks.length) * 100) : 0;

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName("");
    startTransition(async () => {
      const result = await addSubtask(projectId, taskId, trimmed);
      if (result.data) onChange([...subtasks, result.data as Subtask]);
    });
  }

  function handleToggle(subtask: Subtask) {
    onChange(
      subtasks.map((s) => (s.id === subtask.id ? { ...s, is_done: !s.is_done } : s)),
    );
    startTransition(() => {
      toggleSubtask(projectId, taskId, subtask.id, !subtask.is_done);
    });
  }

  function handleDelete(subtask: Subtask) {
    onChange(subtasks.filter((s) => s.id !== subtask.id));
    startTransition(() => {
      deleteSubtask(projectId, taskId, subtask.id);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {subtasks.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {done}/{subtasks.length}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted"
          >
            <Checkbox
              checked={subtask.is_done}
              onCheckedChange={() => handleToggle(subtask)}
            />
            <span
              className={`flex-1 text-sm ${subtask.is_done ? "text-muted-foreground line-through" : ""}`}
            >
              {subtask.name}
            </span>
            <button
              onClick={() => handleDelete(subtask)}
              className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Plus className="size-3.5 text-muted-foreground" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add checklist item"
          className="h-7 border-none bg-transparent px-1 text-sm shadow-none"
        />
      </div>
    </div>
  );
}
