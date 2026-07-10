"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryDonut } from "@/components/category-donut";
import { PrioritySelect, StatusSelect } from "@/components/task-chips";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import { createCategory, createTask, deleteCategory, deleteTask, updateTask } from "./task-actions";

const UNCATEGORIZED = { id: "__none__", name: "Uncategorized" };

export function TableView({
  projectId,
  categories,
  tasks,
  statuses,
  canManage,
  commentCounts,
  onCategoriesChange,
  onTasksChange,
  onTaskUpdate,
  onOpenTask,
}: {
  projectId: string;
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
  canManage: boolean;
  commentCounts: Record<string, number>;
  onCategoriesChange: (categories: CategoryRecord[]) => void;
  onTasksChange: (tasks: TaskRecord[]) => void;
  onTaskUpdate: (taskId: string, patch: Partial<TaskRecord>) => void;
  onOpenTask: (task: TaskRecord) => void;
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newTaskName, setNewTaskName] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const groups = [...categories, UNCATEGORIZED as CategoryRecord].map((cat) => ({
    category: cat,
    tasks: tasks
      .filter((t) => (t.category_id ?? UNCATEGORIZED.id) === cat.id)
      .sort((a, b) => a.position - b.position),
  }));

  function toggleCollapsed(categoryId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setNewCategoryName("");
    setAddingCategory(false);
    startTransition(async () => {
      const result = await createCategory(projectId, name);
      if (result.data) onCategoriesChange([...categories, result.data as CategoryRecord]);
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

  function handleDeleteTask(task: TaskRecord) {
    onTasksChange(tasks.filter((t) => t.id !== task.id));
    startTransition(() => {
      deleteTask(projectId, task.id);
    });
  }

  function handleDeleteCategory(categoryId: string) {
    onCategoriesChange(categories.filter((c) => c.id !== categoryId));
    startTransition(() => {
      deleteCategory(projectId, categoryId);
    });
  }

  function patch(task: TaskRecord, values: Parameters<typeof updateTask>[2]) {
    onTaskUpdate(task.id, values);
    startTransition(() => {
      updateTask(projectId, task.id, values);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ category, tasks: groupTasks }, index) => {
        if (category.id === UNCATEGORIZED.id && groupTasks.length === 0) return null;
        const isCollapsed = collapsed.has(category.id);

        return (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2) }}
            className="overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <button
              onClick={() => toggleCollapsed(category.id)}
              className="flex w-full items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{ rotate: isCollapsed ? -90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground"
                >
                  <ChevronDown className="size-4" />
                </motion.span>
                <h3 className="text-sm font-semibold">{category.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {groupTasks.length} task{groupTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CategoryDonut tasks={groupTasks} statuses={statuses} />
                {canManage && category.id !== UNCATEGORIZED.id && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(category.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete category"
                  >
                    <Trash2 className="size-4" />
                  </span>
                )}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="w-10 px-3 py-2 font-medium">#</th>
                          <th className="w-24 px-3 py-2 font-medium">Created</th>
                          <th className="px-3 py-2 font-medium">Task name</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="w-28 px-3 py-2 font-medium">Priority</th>
                          <th className="w-40 px-3 py-2 font-medium">Status</th>
                          <th className="w-32 px-3 py-2 font-medium">Due date</th>
                          <th className="w-20 px-3 py-2 font-medium">Comments</th>
                          {canManage && <th className="w-10 px-3 py-2" />}
                        </tr>
                      </thead>
                      <tbody>
                        {groupTasks.map((task) => (
                          <tr
                            key={task.id}
                            className="border-b last:border-0 transition-colors hover:bg-primary/[0.04]"
                          >
                            <td className="px-3 py-2 text-muted-foreground">
                              {task.serial_no}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {new Date(task.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                className="text-left font-medium transition-colors hover:text-primary"
                                onClick={() => onOpenTask(task)}
                              >
                                {task.name}
                              </button>
                            </td>
                            <td className="max-w-56 truncate px-3 py-2 text-muted-foreground">
                              {task.description || "—"}
                            </td>
                            <td className="px-3 py-2">
                              <PrioritySelect
                                value={task.priority}
                                onChange={(priority) => patch(task, { priority })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <StatusSelect
                                value={task.status_id}
                                statuses={statuses}
                                onChange={(status_id) => patch(task, { status_id })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="date"
                                defaultValue={task.due_date ?? ""}
                                onChange={(e) =>
                                  patch(task, { due_date: e.target.value || null })
                                }
                                className="h-7 w-full border-none bg-transparent px-1 text-xs shadow-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => onOpenTask(task)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <MessageSquare className="size-3.5" />
                                {commentCounts[task.id] ?? 0}
                              </button>
                            </td>
                            {canManage && (
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => handleDeleteTask(task)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={canManage ? 9 : 8} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Plus className="size-3.5 text-muted-foreground" />
                              <input
                                value={newTaskName[category.id] ?? ""}
                                onChange={(e) =>
                                  setNewTaskName((prev) => ({
                                    ...prev,
                                    [category.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAddTask(category.id);
                                }}
                                placeholder="Add task"
                                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {addingCategory ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
          <Input
            autoFocus
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCategory();
              if (e.key === "Escape") setAddingCategory(false);
            }}
            placeholder="Category name"
            className="h-8"
          />
          <Button size="sm" onClick={handleAddCategory}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingCategory(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAddingCategory(true)}
          className="flex items-center gap-2 self-start rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus className="size-4" />
          Add category
        </button>
      )}
    </div>
  );
}
