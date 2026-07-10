"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckSquare, ChevronDown, MessageSquare, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryDonut } from "@/components/category-donut";
import { PrioritySelect, StatusSelect } from "@/components/task-chips";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  createCategory,
  createTask,
  deleteCategory,
  deleteTask,
  updateTask,
} from "./task-actions";
import { ALL_COLUMNS, TableToolbar, type ColumnKey, type TaskFilters } from "./table-toolbar";

const UNCATEGORIZED = { id: "__none__", name: "Uncategorized" };
const DEFAULT_FILTERS: TaskFilters = { priorities: [], statusIds: [] };

const CATEGORY_ACCENTS = ["#6366f1", "#ec4899", "#0ea5e9", "#f59e0b", "#22c55e", "#a855f7"];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map((c) => c.key)),
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    const storedFilters = localStorage.getItem(`table-filters-${projectId}`);
    if (storedFilters) setFilters(JSON.parse(storedFilters));
    const storedColumns = localStorage.getItem(`table-columns-${projectId}`);
    if (storedColumns) setVisibleColumns(new Set(JSON.parse(storedColumns)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function updateFilters(next: TaskFilters) {
    setFilters(next);
    localStorage.setItem(`table-filters-${projectId}`, JSON.stringify(next));
  }

  function updateVisibleColumns(next: Set<ColumnKey>) {
    setVisibleColumns(next);
    localStorage.setItem(`table-columns-${projectId}`, JSON.stringify(Array.from(next)));
  }

  const filteredTasks = tasks.filter((t) => {
    if (filters.priorities.length > 0 && !filters.priorities.includes(t.priority)) return false;
    if (filters.statusIds.length > 0 && !(t.status_id && filters.statusIds.includes(t.status_id)))
      return false;
    return true;
  });

  const groups = [...categories, UNCATEGORIZED as CategoryRecord].map((cat) => ({
    category: cat,
    tasks: filteredTasks
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

  function toggleSelected(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
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

  function bulkSetPriority(priority: "high" | "medium" | "low") {
    const ids = Array.from(selected);
    onTasksChange(tasks.map((t) => (ids.includes(t.id) ? { ...t, priority } : t)));
    startTransition(() => {
      bulkUpdateTasks(projectId, ids, { priority });
    });
  }

  function bulkSetStatus(statusId: string) {
    const ids = Array.from(selected);
    onTasksChange(tasks.map((t) => (ids.includes(t.id) ? { ...t, status_id: statusId } : t)));
    startTransition(() => {
      bulkUpdateTasks(projectId, ids, { status_id: statusId });
    });
  }

  function bulkDelete() {
    const ids = Array.from(selected);
    onTasksChange(tasks.filter((t) => !ids.includes(t.id)));
    setSelected(new Set());
    startTransition(() => {
      bulkDeleteTasks(projectId, ids);
    });
  }

  const colSpan =
    2 + 1 + (visibleColumns.size) + (canManage ? 2 : 1);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TableToolbar
        statuses={statuses}
        filters={filters}
        onFiltersChange={updateFilters}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={updateVisibleColumns}
      />

      <div className="flex min-w-0 flex-col gap-5">
        {groups.map(({ category, tasks: groupTasks }, index) => {
          if (category.id === UNCATEGORIZED.id && groupTasks.length === 0) return null;
          const isCollapsed = collapsed.has(category.id);

          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2) }}
              style={
                category.id !== UNCATEGORIZED.id
                  ? { borderLeft: `3px solid ${accentFor(category.id)}` }
                  : undefined
              }
              className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm"
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
                    className="min-w-0 overflow-hidden"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[840px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="w-8 px-3 py-2" />
                            <th className="w-10 px-3 py-2 font-medium">#</th>
                            <th className="w-24 px-3 py-2 font-medium">Created</th>
                            <th className="px-3 py-2 font-medium">Task name</th>
                            {visibleColumns.has("description") && (
                              <th className="px-3 py-2 font-medium">Description</th>
                            )}
                            {visibleColumns.has("priority") && (
                              <th className="w-28 px-3 py-2 font-medium">Priority</th>
                            )}
                            {visibleColumns.has("status") && (
                              <th className="w-40 px-3 py-2 font-medium">Status</th>
                            )}
                            {visibleColumns.has("dueDate") && (
                              <th className="w-32 px-3 py-2 font-medium">Due date</th>
                            )}
                            {visibleColumns.has("comments") && (
                              <th className="w-20 px-3 py-2 font-medium">Comments</th>
                            )}
                            {canManage && <th className="w-10 px-3 py-2" />}
                          </tr>
                        </thead>
                        <tbody>
                          {groupTasks.map((task) => (
                            <tr
                              key={task.id}
                              className={`border-b last:border-0 transition-colors hover:bg-primary/[0.04] ${
                                selected.has(task.id) ? "bg-primary/[0.06]" : ""
                              }`}
                            >
                              <td className="px-3 py-2">
                                <Checkbox
                                  checked={selected.has(task.id)}
                                  onCheckedChange={() => toggleSelected(task.id)}
                                />
                              </td>
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
                              {visibleColumns.has("description") && (
                                <td className="max-w-56 truncate px-3 py-2 text-muted-foreground">
                                  {task.description || "—"}
                                </td>
                              )}
                              {visibleColumns.has("priority") && (
                                <td className="px-3 py-2">
                                  <PrioritySelect
                                    value={task.priority}
                                    onChange={(priority) => patch(task, { priority })}
                                  />
                                </td>
                              )}
                              {visibleColumns.has("status") && (
                                <td className="px-3 py-2">
                                  <StatusSelect
                                    value={task.status_id}
                                    statuses={statuses}
                                    onChange={(status_id) => patch(task, { status_id })}
                                  />
                                </td>
                              )}
                              {visibleColumns.has("dueDate") && (
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
                              )}
                              {visibleColumns.has("comments") && (
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => onOpenTask(task)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <MessageSquare className="size-3.5" />
                                    {commentCounts[task.id] ?? 0}
                                  </button>
                                </td>
                              )}
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
                            <td colSpan={colSpan} className="px-3 py-2">
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

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-2xl border bg-popover px-4 py-2.5 shadow-lg"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <CheckSquare className="size-4 text-primary" />
              {selected.size} selected
            </span>
            <div className="flex items-center gap-1">
              {(["high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => bulkSetPriority(p)}
                  className="rounded-full border px-2 py-1 text-xs capitalize hover:bg-muted"
                >
                  {p}
                </button>
              ))}
            </div>
            <select
              onChange={(e) => e.target.value && bulkSetStatus(e.target.value)}
              defaultValue=""
              className="rounded-full border bg-background px-2 py-1 text-xs"
            >
              <option value="" disabled>
                Set status…
              </option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {canManage && (
              <Button size="sm" variant="destructive" onClick={bulkDelete}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
