"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, MessageSquare, Plus } from "lucide-react";

import { PriorityChip, StatusChip } from "@/components/task-chips";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import { createTask, updateTask } from "./task-actions";

const UNCATEGORIZED = { id: "__none__", name: "Uncategorized" };

function TaskCard({
  task,
  statuses,
  commentCount,
  onOpen,
}: {
  task: TaskRecord;
  statuses: Status[];
  commentCount: number;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const status = statuses.find((s) => s.id === task.status_id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="flex cursor-grab flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/20 active:cursor-grabbing"
    >
      <p className="font-medium leading-snug">{task.name}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={task.priority} />
        <StatusChip status={status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5" />
          {task.due_date
            ? new Date(task.due_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "No date"}
        </span>
        {commentCount > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {commentCount}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({
  category,
  tasks,
  statuses,
  commentCounts,
  onOpen,
  newTaskName,
  onNewTaskNameChange,
  onAddTask,
}: {
  category: CategoryRecord;
  tasks: TaskRecord[];
  statuses: Status[];
  commentCounts: Record<string, number>;
  onOpen: (task: TaskRecord) => void;
  newTaskName: string;
  onNewTaskNameChange: (value: string) => void;
  onAddTask: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: category.id });

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <h3 className="text-sm font-semibold">{category.name}</h3>
        </div>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm">
          {tasks.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              statuses={statuses}
              commentCount={commentCounts[task.id] ?? 0}
              onOpen={() => onOpen(task)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <Plus className="size-3.5 text-muted-foreground" />
        <input
          value={newTaskName}
          onChange={(e) => onNewTaskNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAddTask();
          }}
          placeholder="Add task"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

export function KanbanView({
  projectId,
  categories,
  tasks,
  statuses,
  commentCounts,
  onTasksChange,
  onOpenTask,
}: {
  projectId: string;
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
  commentCounts: Record<string, number>;
  onTasksChange: (tasks: TaskRecord[]) => void;
  onOpenTask: (task: TaskRecord) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const columns = [...categories, UNCATEGORIZED as CategoryRecord];

  function tasksFor(categoryId: string) {
    return tasks
      .filter((t) => (t.category_id ?? UNCATEGORIZED.id) === categoryId)
      .sort((a, b) => a.position - b.position);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overTask = tasks.find((t) => t.id === over.id);
    const targetCategoryId = overTask
      ? overTask.category_id ?? UNCATEGORIZED.id
      : String(over.id);

    if (!columns.some((c) => c.id === targetCategoryId)) return;

    const destTasks = tasksFor(targetCategoryId).filter((t) => t.id !== activeTask.id);
    const overIndex = overTask ? destTasks.findIndex((t) => t.id === overTask.id) : destTasks.length;
    const insertAt = overIndex === -1 ? destTasks.length : overIndex;
    destTasks.splice(insertAt, 0, activeTask);

    const updatedDest = destTasks.map((t, i) => ({
      ...t,
      category_id: targetCategoryId === UNCATEGORIZED.id ? null : targetCategoryId,
      position: i,
    }));

    const otherTasks = tasks.filter(
      (t) =>
        t.id !== activeTask.id &&
        (t.category_id ?? UNCATEGORIZED.id) !== targetCategoryId,
    );

    const nextTasks = [...otherTasks, ...updatedDest];
    onTasksChange(nextTasks);

    const moved = updatedDest.find((t) => t.id === activeTask.id)!;
    startTransition(() => {
      updateTask(projectId, moved.id, {
        category_id: moved.category_id,
        position: moved.position,
      });
    });
  }

  function handleAddTask(categoryId: string) {
    const name = (newTaskName[categoryId] ?? "").trim();
    if (!name) return;
    setNewTaskName((prev) => ({ ...prev, [categoryId]: "" }));
    startTransition(async () => {
      const result = await createTask(
        projectId,
        categoryId === UNCATEGORIZED.id ? null : categoryId,
        name,
      );
      if (result.data) onTasksChange([...tasks, result.data as TaskRecord]);
    });
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((category) => (
          <Column
            key={category.id}
            category={category}
            tasks={tasksFor(category.id)}
            statuses={statuses}
            commentCounts={commentCounts}
            onOpen={onOpenTask}
            newTaskName={newTaskName[category.id] ?? ""}
            onNewTaskNameChange={(value) =>
              setNewTaskName((prev) => ({ ...prev, [category.id]: value }))
            }
            onAddTask={() => handleAddTask(category.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 scale-105 shadow-xl">
            <TaskCard
              task={activeTask}
              statuses={statuses}
              commentCount={commentCounts[activeTask.id] ?? 0}
              onOpen={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
