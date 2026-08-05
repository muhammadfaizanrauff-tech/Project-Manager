"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Repeat, Send, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PrioritySelect, StatusSelect } from "@/components/task-chips";
import type { DependencyRef, Subtask, TimeLog, Label as LabelRow } from "@/lib/task-extras";
import type { CommentRecord, Status, TaskRecord } from "@/lib/tasks";
import { addComment, deleteComment, updateTask } from "./task-actions";
import { setRecurrence } from "./task-extras-actions";
import { getTaskExtras } from "./extras-fetch-actions";
import { TaskChecklist } from "./task-sheet-checklist";
import { TaskLinks } from "./task-sheet-links";
import { TaskTimePanel } from "./task-sheet-time";

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const emptyExtras = {
  subtasks: [] as Subtask[],
  labels: [] as LabelRow[],
  taskLabelIds: [] as string[],
  dependsOn: [] as DependencyRef[],
  blocks: [] as DependencyRef[],
  timeLogs: [] as TimeLog[],
};

export function TaskSheet({
  task,
  statuses,
  members,
  allTasks,
  projectLabels,
  canDelete,
  onOpenChange,
  onTaskChange,
  onCommentsChange,
  fetchComments,
}: {
  task: TaskRecord | null;
  statuses: Status[];
  members: { id: string; full_name: string | null; role: string }[];
  allTasks: TaskRecord[];
  projectLabels: LabelRow[];
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskChange: (taskId: string, patch: Partial<TaskRecord>) => void;
  onCommentsChange: (comments: CommentRecord[]) => void;
  fetchComments: (taskId: string) => Promise<CommentRecord[]>;
}) {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [extras, setExtras] = useState(emptyExtras);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(task?.name ?? "");
    setDescription(task?.description ?? "");
    if (task) {
      fetchComments(task.id).then((data) => {
        setComments(data);
        onCommentsChange(data);
      });
      getTaskExtras(task.id).then((data) => {
        setExtras({ ...data, labels: projectLabels });
      });
    } else {
      setComments([]);
      setExtras(emptyExtras);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  function save(patch: Parameters<typeof updateTask>[2]) {
    if (!task) return;
    onTaskChange(task.id, patch);
    startTransition(() => {
      updateTask(task.project_id, task.id, patch);
    });
  }

  function handleAddComment() {
    if (!task || !commentBody.trim()) return;
    const body = commentBody.trim();
    setCommentBody("");
    startTransition(async () => {
      const result = await addComment(task.project_id, task.id, body);
      if (result.data) {
        setComments((prev) => [...prev, result.data as unknown as CommentRecord]);
      }
    });
  }

  function handleDeleteComment(commentId: string) {
    if (!task) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    startTransition(() => {
      deleteComment(task.project_id, commentId);
    });
  }

  const blockedByOpen = extras.dependsOn.length > 0;

  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Task #{task.serial_no}
            {blockedByOpen && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                Blocked
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            Created {new Date(task.created_at).toLocaleDateString("en-US")}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 w-fit">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist
              {extras.subtasks.length > 0 && (
                <span className="ml-1 text-muted-foreground">({extras.subtasks.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="links">Links</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <TabsContent value="details" className="flex flex-col gap-4 pt-3">
              <div className="flex flex-col gap-1.5">
                <Label>Task name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && name !== task.name && save({ name: name.trim() })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  value={description ?? ""}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => description !== task.description && save({ description })}
                  placeholder="Add more detail…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Priority</Label>
                  <PrioritySelect
                    value={task.priority}
                    onChange={(priority) => save({ priority })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Status</Label>
                  <StatusSelect
                    value={task.status_id}
                    statuses={statuses}
                    onChange={(status_id) => save({ status_id })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    defaultValue={task.due_date ?? ""}
                    onChange={(e) => save({ due_date: e.target.value || null })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Assignee</Label>
                  <Select
                    value={task.assignee_id ?? undefined}
                    onValueChange={(v) => save({ assignee_id: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  <Repeat className="size-3.5" />
                  Repeats
                </Label>
                <Select
                  value={task.recurrence}
                  onValueChange={(v) => {
                    onTaskChange(task.id, { recurrence: v as TaskRecord["recurrence"] } as Partial<TaskRecord>);
                    startTransition(() => {
                      setRecurrence(task.project_id, task.id, v as "none" | "daily" | "weekly" | "monthly");
                    });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn&apos;t repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                {task.recurrence !== "none" && (
                  <p className="text-xs text-muted-foreground">
                    A new task is created automatically when this one is marked Done.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t pt-4">
                <Label>Comments</Label>
                <div className="flex flex-col gap-3">
                  {comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <Avatar className="size-6">
                        <AvatarFallback className="text-[10px]">
                          {initials(c.author?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">
                            {c.author?.full_name ?? "Unknown"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(c.created_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a comment…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddComment();
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleAddComment}
                    disabled={pending || !commentBody.trim()}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="pt-3">
              <TaskChecklist
                projectId={task.project_id}
                taskId={task.id}
                subtasks={extras.subtasks}
                onChange={(subtasks) => setExtras((prev) => ({ ...prev, subtasks }))}
              />
            </TabsContent>

            <TabsContent value="links" className="pt-3">
              <TaskLinks
                projectId={task.project_id}
                taskId={task.id}
                allTasks={allTasks}
                labels={projectLabels}
                taskLabelIds={extras.taskLabelIds}
                dependsOn={extras.dependsOn}
                blocks={extras.blocks}
                onLabelsChange={() => {}}
                onTaskLabelIdsChange={(taskLabelIds) =>
                  setExtras((prev) => ({ ...prev, taskLabelIds }))
                }
                onDependsOnChange={(dependsOn) => setExtras((prev) => ({ ...prev, dependsOn }))}
              />
            </TabsContent>

            <TabsContent value="time" className="pt-3">
              <TaskTimePanel
                projectId={task.project_id}
                taskId={task.id}
                estimateMinutes={task.estimate_minutes}
                timeLogs={extras.timeLogs}
                onEstimateChange={(estimate_minutes) =>
                  onTaskChange(task.id, { estimate_minutes } as Partial<TaskRecord>)
                }
                onTimeLogsChange={(timeLogs) => setExtras((prev) => ({ ...prev, timeLogs }))}
              />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
