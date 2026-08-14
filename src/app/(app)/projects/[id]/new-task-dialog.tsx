"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PriorityChip, StatusChip } from "@/components/task-chips";
import type { Status, TaskRecord } from "@/lib/tasks";
import { createTask } from "./task-actions";

const UNASSIGNED = "__unassigned__";
const NO_STATUS = "__none__";

/**
 * The long-form counterpart to the one-line "Add" box in each category: fill in
 * everything the task needs, then confirm it with the button at the bottom.
 * Nothing is written until that button is pressed, so a half-filled form can be
 * abandoned without leaving an empty task behind.
 */
export function NewTaskDialog({
  projectId,
  categoryId,
  categoryName,
  statuses,
  members,
  initialName,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  /** null for the Uncategorized group. */
  categoryId: string | null;
  categoryName: string;
  statuses: Status[];
  members: { id: string; full_name: string | null; role: string }[];
  /** Whatever was already typed into the quick-add box, carried over. */
  initialName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (task: TaskRecord) => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [statusId, setStatusId] = useState<string>(NO_STATUS);
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setDescription("");
    setPriority("medium");
    setStatusId(NO_STATUS);
    setDueDate("");
    setAssigneeId(UNASSIGNED);
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setError(null);

    startTransition(async () => {
      const result = await createTask(projectId, categoryId, trimmed, {
        description: description.trim() || null,
        priority,
        status_id: statusId === NO_STATUS ? null : statusId,
        due_date: dueDate || null,
        assignee_id: assigneeId === UNASSIGNED ? null : assigneeId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) onCreated(result.data as TaskRecord);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>
            It goes into <strong>{categoryName}</strong>. Fill in whatever you know — the rest
            can be changed later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-name">Task name</Label>
            <Input
              id="new-task-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs doing?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea
              id="new-task-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more detail…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => v && setPriority(v as typeof priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["high", "medium", "low"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      <PriorityChip priority={p} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={statusId} onValueChange={(v) => v && setStatusId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATUS}>No status</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <StatusChip status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-due">Due date</Label>
              <Input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={(v) => v && setAssigneeId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
