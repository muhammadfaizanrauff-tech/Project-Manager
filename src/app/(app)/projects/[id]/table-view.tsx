"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryDonut } from "@/components/category-donut";
import { PrioritySelect, StatusSelect } from "@/components/task-chips";
import { upsertById } from "@/lib/utils";
import type { ImportBatch } from "@/lib/imports";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import {
  requestBulkTaskDeletion,
  requestTaskDeletion,
} from "./delete-request-actions";
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  createTask,
  deleteCategory,
  deleteTask,
  renameCategory,
  updateTask,
} from "./task-actions";
import { NewTaskDialog } from "./new-task-dialog";
import { ALL_COLUMNS, TableToolbar, type ColumnKey, type TaskFilters } from "./table-toolbar";

const UNCATEGORIZED = { id: "__none__", name: "Uncategorized" };
const DEFAULT_FILTERS: TaskFilters = { priorities: [], statusIds: [], importBatchId: null };

const CATEGORY_ACCENTS = ["#6366f1", "#ec4899", "#0ea5e9", "#f59e0b", "#22c55e", "#a855f7"];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
}

type TaskPatch = Parameters<typeof updateTask>[2];

// A finished task stays on the list — you still want to see what got done —
// but it steps back visually: a light green wash and dimmed text, so the eye
// lands on the work that's still open above it.
const DONE_ROW_CLASS =
  "bg-green-50 text-muted-foreground opacity-70 hover:bg-green-100/70 dark:bg-green-500/10 dark:hover:bg-green-500/15";

// Every row mounts a checkbox, two dropdowns and a date input, so a project
// with a few hundred tasks has well over a thousand interactive components on
// screen. Memoising the row means a state change in the parent (typing in
// search, toggling a filter, selecting one task) only re-renders the rows that
// actually changed. Every callback below is passed in already-stable so the
// memo isn't defeated by a fresh closure each render.
const TaskRow = memo(function TaskRow({
  task,
  statuses,
  visibleColumns,
  canDelete,
  isSelected,
  isDone,
  commentCount,
  deleteRequested,
  onToggleSelect,
  onOpenTask,
  onPatch,
  onDelete,
  onRequestDelete,
}: {
  task: TaskRecord;
  statuses: Status[];
  visibleColumns: Set<ColumnKey>;
  canDelete: boolean;
  isSelected: boolean;
  isDone: boolean;
  commentCount: number;
  deleteRequested: boolean;
  onToggleSelect: (taskId: string) => void;
  onOpenTask: (task: TaskRecord) => void;
  onPatch: (task: TaskRecord, values: TaskPatch) => void;
  onDelete: (task: TaskRecord) => void;
  onRequestDelete: (task: TaskRecord) => void;
}) {
  return (
    <tr
      className={`border-b last:border-0 transition-colors ${
        isDone ? DONE_ROW_CLASS : "hover:bg-primary/[0.04]"
      } ${isSelected ? "bg-primary/[0.06]" : ""}`}
    >
      <td className="px-3 py-2">
        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(task.id)} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{task.serial_no}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {new Date(task.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </td>
      <td className="px-3 py-2">
        <button
          className={`text-left font-medium transition-colors hover:text-primary ${
            isDone ? "line-through decoration-muted-foreground/50" : ""
          }`}
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
            onChange={(priority) => onPatch(task, { priority })}
          />
        </td>
      )}
      {visibleColumns.has("status") && (
        <td className="px-3 py-2">
          <StatusSelect
            value={task.status_id}
            statuses={statuses}
            onChange={(status_id) => onPatch(task, { status_id })}
          />
        </td>
      )}
      {visibleColumns.has("dueDate") && (
        <td className="px-3 py-2">
          <Input
            type="date"
            defaultValue={task.due_date ?? ""}
            onChange={(e) => onPatch(task, { due_date: e.target.value || null })}
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
            {commentCount}
          </button>
        </td>
      )}
      {canDelete ? (
        <td className="px-3 py-2">
          <button
            onClick={() => onDelete(task)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </td>
      ) : (
        <td className="px-3 py-2">
          <button
            onClick={() => onRequestDelete(task)}
            disabled={deleteRequested}
            title={deleteRequested ? "Delete request sent" : "Request deletion"}
            className="text-muted-foreground hover:text-destructive disabled:cursor-default disabled:text-primary disabled:hover:text-primary"
          >
            {deleteRequested ? <Clock className="size-3.5" /> : <Trash2 className="size-3.5" />}
          </button>
        </td>
      )}
    </tr>
  );
});

// Below md the table is unusable — 840px of columns in a 360px viewport means
// every dropdown and date field sits off-screen behind a horizontal scroll.
// The same row is rendered as a stacked card instead: identical data, identical
// callbacks, just laid out vertically with touch-sized controls.
const TaskCard = memo(function TaskCard({
  task,
  statuses,
  visibleColumns,
  canDelete,
  isSelected,
  isDone,
  commentCount,
  deleteRequested,
  onToggleSelect,
  onOpenTask,
  onPatch,
  onDelete,
  onRequestDelete,
}: {
  task: TaskRecord;
  statuses: Status[];
  visibleColumns: Set<ColumnKey>;
  canDelete: boolean;
  isSelected: boolean;
  isDone: boolean;
  commentCount: number;
  deleteRequested: boolean;
  onToggleSelect: (taskId: string) => void;
  onOpenTask: (task: TaskRecord) => void;
  onPatch: (task: TaskRecord, values: TaskPatch) => void;
  onDelete: (task: TaskRecord) => void;
  onRequestDelete: (task: TaskRecord) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-2 border-b p-3 last:border-0 ${
        isDone ? DONE_ROW_CLASS : ""
      } ${isSelected ? "bg-primary/[0.06]" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(task.id)} />
        </span>
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpenTask(task)}
        >
          <span
            className={`block text-sm font-medium leading-snug ${
              isDone ? "line-through decoration-muted-foreground/50" : ""
            }`}
          >
            {task.name}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            #{task.serial_no} ·{" "}
            {new Date(task.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </button>
        {canDelete ? (
          <button
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.name}`}
            className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        ) : (
          <button
            onClick={() => onRequestDelete(task)}
            disabled={deleteRequested}
            aria-label={deleteRequested ? "Delete request sent" : `Request deletion of ${task.name}`}
            className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive disabled:cursor-default disabled:text-primary"
          >
            {deleteRequested ? <Clock className="size-4" /> : <Trash2 className="size-4" />}
          </button>
        )}
      </div>

      {visibleColumns.has("description") && task.description && (
        <p className="line-clamp-2 pl-[2.625rem] text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pl-[2.625rem]">
        {visibleColumns.has("priority") && (
          <PrioritySelect
            value={task.priority}
            onChange={(priority) => onPatch(task, { priority })}
          />
        )}
        {visibleColumns.has("status") && (
          <StatusSelect
            value={task.status_id}
            statuses={statuses}
            onChange={(status_id) => onPatch(task, { status_id })}
          />
        )}
        {visibleColumns.has("dueDate") && (
          <Input
            type="date"
            aria-label="Due date"
            defaultValue={task.due_date ?? ""}
            onChange={(e) => onPatch(task, { due_date: e.target.value || null })}
            className="h-7 w-auto min-w-0 shrink px-1.5 text-xs"
          />
        )}
        {visibleColumns.has("comments") && (
          <button
            onClick={() => onOpenTask(task)}
            className="flex h-7 items-center gap-1 text-xs text-muted-foreground"
          >
            <MessageSquare className="size-3.5" />
            {commentCount}
          </button>
        )}
      </div>
    </div>
  );
});

export function TableView({
  projectId,
  categories,
  tasks,
  statuses,
  members,
  canDelete,
  canSeeAllTasks,
  commentCounts,
  onCategoriesChange,
  onTasksChange,
  onTaskUpdate,
  onOpenTask,
  importBatches,
  initialImportBatchId,
}: {
  projectId: string;
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
  /** Who a new task can be assigned to from the Add task dialog. */
  members: { id: string; full_name: string | null; role: string }[];
  canDelete: boolean;
  /** False when the viewer only gets their own tasks (schema-v12), which is
   *  worth saying out loud — otherwise a project looks like it lost its work. */
  canSeeAllTasks: boolean;
  commentCounts: Record<string, number>;
  importBatches: ImportBatch[];
  /** From `?import=<id>` — arriving from the import history pre-filters the table. */
  initialImportBatchId?: string;
  // Setter-shaped so handlers can update functionally and stay dependency-free
  // (and therefore referentially stable for the memoised rows).
  onCategoriesChange: Dispatch<SetStateAction<CategoryRecord[]>>;
  onTasksChange: Dispatch<SetStateAction<TaskRecord[]>>;
  onTaskUpdate: (taskId: string, patch: Partial<TaskRecord>) => void;
  onOpenTask: (task: TaskRecord) => void;
}) {
  const [newTaskName, setNewTaskName] = useState<Record<string, string>>({});
  // Tracked as "which are open" rather than "which are closed" so everything
  // starts collapsed on every visit — a project with a dozen categories is a
  // wall of rows otherwise. Nothing is persisted: closed is the state you get
  // each time you log in or open the project, by request.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  /** Which category the Add task dialog is currently adding to. */
  const [addTaskTo, setAddTaskTo] = useState<CategoryRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requestedDeleteIds, setRequestedDeleteIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  // Deliberately not persisted like filters/columns are — a search you typed
  // last week shouldn't silently hide tasks when you come back.
  const [search, setSearch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map((c) => c.key)),
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    const storedFilters = localStorage.getItem(`table-filters-${projectId}`);
    // Merged over the defaults rather than used as-is: filters saved before
    // the import filter existed have no importBatchId key at all.
    if (storedFilters) {
      setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(storedFilters) });
    }
    const storedColumns = localStorage.getItem(`table-columns-${projectId}`);
    if (storedColumns) setVisibleColumns(new Set(JSON.parse(storedColumns)));
    // A batch id in the URL always wins — you followed a link to see exactly
    // that import, so a stale saved filter mustn't override it.
    if (initialImportBatchId) {
      setFilters((prev) => ({ ...prev, importBatchId: initialImportBatchId }));
    }
  }, [projectId, initialImportBatchId]);

  // "Everything starts closed" shouldn't mean a category you just added stays
  // hidden, so anything that turns up after the first render — your own new
  // category, or someone else's arriving over Realtime — opens itself.
  const knownCategoryIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = categories.map((c) => c.id);
    if (knownCategoryIds.current === null) {
      knownCategoryIds.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !knownCategoryIds.current!.has(id));
    knownCategoryIds.current = new Set(ids);
    if (fresh.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      fresh.forEach((id) => next.add(id));
      return next;
    });
  }, [categories]);

  function updateFilters(next: TaskFilters) {
    setFilters(next);
    localStorage.setItem(`table-filters-${projectId}`, JSON.stringify(next));
  }

  function updateVisibleColumns(next: Set<ColumnKey>) {
    setVisibleColumns(next);
    localStorage.setItem(`table-columns-${projectId}`, JSON.stringify(Array.from(next)));
  }

  // The input stays bound to `search` so typing is always instant; the
  // expensive re-filter runs against the deferred value and is allowed to lag
  // a frame behind rather than blocking each keystroke.
  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  const statusLabelById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s.label.toLowerCase()])),
    [statuses],
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (filters.priorities.length > 0 && !filters.priorities.includes(t.priority))
          return false;
        if (
          filters.statusIds.length > 0 &&
          !(t.status_id && filters.statusIds.includes(t.status_id))
        )
          return false;
        if (filters.importBatchId && t.import_batch_id !== filters.importBatchId) return false;
        if (query) {
          const haystack = [
            t.name,
            t.description ?? "",
            `#${t.serial_no}`,
            String(t.serial_no),
            t.priority,
            t.status_id ? statusLabelById.get(t.status_id) ?? "" : "",
            t.due_date ?? "",
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      }),
    [tasks, filters, query, statusLabelById],
  );

  // Statuses are configurable rows, not an enum, so "finished" is matched on
  // the label the same way the rest of the app does it.
  const doneStatusIds = useMemo(
    () => new Set(statuses.filter((s) => s.label === "Done").map((s) => s.id)),
    [statuses],
  );

  const isDone = useCallback(
    (task: TaskRecord) => Boolean(task.status_id && doneStatusIds.has(task.status_id)),
    [doneStatusIds],
  );

  const groups = useMemo(
    () =>
      [...categories, UNCATEGORIZED as CategoryRecord].map((cat) => ({
        category: cat,
        tasks: filteredTasks
          .filter((t) => (t.category_id ?? UNCATEGORIZED.id) === cat.id)
          // Two rules, in order: unfinished work sits above anything already
          // done, and within each half the newest task is first. `position`
          // only breaks ties now — it still drives the Kanban ordering, but in
          // the table it meant new tasks landed at the bottom of a long list.
          .sort((a, b) => {
            const doneA = isDone(a);
            const doneB = isDone(b);
            if (doneA !== doneB) return doneA ? 1 : -1;
            const byCreated =
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            if (byCreated !== 0) return byCreated;
            return b.position - a.position;
          }),
      })),
    [categories, filteredTasks, isDone],
  );

  function toggleCollapsed(categoryId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const toggleSelected = useCallback((taskId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  function startRename(category: CategoryRecord) {
    setRenamingId(category.id);
    setRenameValue(category.name);
    setRenameError(null);
  }

  function handleRename(categoryId: string) {
    const name = renameValue.trim();
    const current = categories.find((c) => c.id === categoryId);
    if (!name || name === current?.name) {
      setRenamingId(null);
      return;
    }

    startTransition(async () => {
      const result = await renameCategory(projectId, categoryId, name);
      if (result.error) {
        setRenameError(result.error);
        return;
      }
      if (result.data) {
        onCategoriesChange((prev) => upsertById(prev, result.data as CategoryRecord));
      }
      setRenamingId(null);
      setRenameError(null);
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
      if (result.data) onTasksChange((prev) => upsertById(prev, result.data as TaskRecord));
    });
  }

  const handleDeleteTask = useCallback(
    (task: TaskRecord) => {
      onTasksChange((prev) => prev.filter((t) => t.id !== task.id));
      startTransition(() => {
        deleteTask(projectId, task.id);
      });
    },
    [onTasksChange, projectId, startTransition],
  );

  const handleRequestDelete = useCallback(
    (task: TaskRecord) => {
      setRequestedDeleteIds((prev) => new Set(prev).add(task.id));
      startTransition(() => {
        requestTaskDeletion(projectId, task.id, task.name);
      });
    },
    [projectId, startTransition],
  );

  function handleDeleteCategory(categoryId: string) {
    onCategoriesChange((prev) => prev.filter((c) => c.id !== categoryId));
    startTransition(() => {
      deleteCategory(projectId, categoryId);
    });
  }

  const patch = useCallback(
    (task: TaskRecord, values: TaskPatch) => {
      onTaskUpdate(task.id, values);
      startTransition(() => {
        updateTask(projectId, task.id, values);
      });
    },
    [onTaskUpdate, projectId, startTransition],
  );

  function bulkSetPriority(priority: "high" | "medium" | "low") {
    const ids = Array.from(selected);
    onTasksChange((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, priority } : t)));
    startTransition(() => {
      bulkUpdateTasks(projectId, ids, { priority });
    });
  }

  function bulkSetStatus(statusId: string) {
    const ids = Array.from(selected);
    onTasksChange((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, status_id: statusId } : t)),
    );
    startTransition(() => {
      bulkUpdateTasks(projectId, ids, { status_id: statusId });
    });
  }

  function bulkDelete() {
    const ids = Array.from(selected);
    onTasksChange((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelected(new Set());
    startTransition(() => {
      bulkDeleteTasks(projectId, ids);
    });
  }

  function bulkRequestDelete() {
    const targets = tasks.filter((t) => selected.has(t.id));
    setRequestedDeleteIds((prev) => {
      const next = new Set(prev);
      targets.forEach((t) => next.add(t.id));
      return next;
    });
    setSelected(new Set());
    startTransition(() => {
      requestBulkTaskDeletion(
        projectId,
        targets.map((t) => ({ id: t.id, name: t.name })),
      );
    });
  }

  const colSpan = 2 + 1 + visibleColumns.size + 2;

  // Collapsed-by-default and searching don't mix: the toolbar would report
  // "12 results" above twelve closed groups. While a search or filter is on,
  // any group that still has matches shows them.
  const isFiltering =
    query.length > 0 ||
    filters.priorities.length > 0 ||
    filters.statusIds.length > 0 ||
    Boolean(filters.importBatchId);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TableToolbar
        statuses={statuses}
        filters={filters}
        onFiltersChange={updateFilters}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={updateVisibleColumns}
        search={search}
        onSearchChange={setSearch}
        resultCount={filteredTasks.length}
        importBatches={importBatches}
      />

      {/* Categories are still all listed even when most come back empty —
          they're the project's structure, and a member needs the heading there
          to add a task under it. What needs saying is why they're empty. */}
      {!canSeeAllTasks && (
        <p className="rounded-xl border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          You&apos;re seeing the tasks <strong>assigned to you</strong> or that{" "}
          <strong>you created</strong>. Other people&apos;s work in this project stays with
          them — ask a project manager if you need something you can&apos;t find.
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-5">
        {groups.map(({ category, tasks: groupTasks }, index) => {
          if (category.id === UNCATEGORIZED.id && groupTasks.length === 0) return null;
          const isCollapsed = isFiltering
            ? groupTasks.length === 0
            : !expanded.has(category.id);
          const isRenaming = renamingId === category.id;
          const openCount = groupTasks.filter((t) => !isDone(t)).length;

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
              {/* A row rather than one big button: renaming puts a text input
                  in here, and an input nested inside a <button> can't be typed
                  into. Only the title area toggles the group now. */}
              <div className="flex w-full items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
                {isRenaming ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => {
                          setRenameValue(e.target.value);
                          setRenameError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(category.id);
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameError(null);
                          }
                        }}
                        aria-label={`Rename ${category.name}`}
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRename(category.id)}
                        disabled={!renameValue.trim()}
                      >
                        <Check className="size-3.5" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRenamingId(null);
                          setRenameError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {renameError && (
                      <p className="text-xs text-destructive">{renameError}</p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => toggleCollapsed(category.id)}
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <motion.span
                      animate={{ rotate: isCollapsed ? -90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="shrink-0 text-muted-foreground"
                    >
                      <ChevronDown className="size-4" />
                    </motion.span>
                    <h3 className="truncate text-sm font-semibold">{category.name}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {openCount} open / {groupTasks.length} task
                      {groupTasks.length === 1 ? "" : "s"}
                    </span>
                  </button>
                )}

                {!isRenaming && (
                  <div className="flex shrink-0 items-center gap-2">
                    <CategoryDonut tasks={groupTasks} statuses={statuses} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddTaskTo(category);
                        setExpanded((prev) => new Set(prev).add(category.id));
                      }}
                      title={`Add a task to ${category.name}`}
                    >
                      <Plus className="size-3.5" />
                      <span className="hidden sm:inline">Add task</span>
                    </Button>
                    {category.id !== UNCATEGORIZED.id && (
                      <button
                        onClick={() => startRename(category)}
                        className="text-muted-foreground hover:text-primary"
                        aria-label={`Rename ${category.name}`}
                        title="Rename category"
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                    {canDelete && category.id !== UNCATEGORIZED.id && (
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${category.name}`}
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="min-w-0 overflow-hidden"
                  >
                    {/* Mobile: stacked cards. */}
                    <div className="md:hidden">
                      {groupTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          statuses={statuses}
                          visibleColumns={visibleColumns}
                          canDelete={canDelete}
                          isSelected={selected.has(task.id)}
                          isDone={isDone(task)}
                          commentCount={commentCounts[task.id] ?? 0}
                          deleteRequested={requestedDeleteIds.has(task.id)}
                          onToggleSelect={toggleSelected}
                          onOpenTask={onOpenTask}
                          onPatch={patch}
                          onDelete={handleDeleteTask}
                          onRequestDelete={handleRequestDelete}
                        />
                      ))}
                      <div className="flex flex-col gap-2 p-3">
                        <div className="flex items-center gap-2">
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
                            aria-label={`Add a task to ${category.name}`}
                            className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddTask(category.id)}
                            disabled={!(newTaskName[category.id] ?? "").trim()}
                          >
                            <Plus className="size-3.5" />
                            Add
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="self-start"
                          onClick={() => setAddTaskTo(category)}
                        >
                          Add with details…
                        </Button>
                      </div>
                    </div>

                    {/* md and up: the full table. */}
                    <div className="hidden overflow-x-auto md:block">
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
                            <th className="w-10 px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {groupTasks.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              statuses={statuses}
                              visibleColumns={visibleColumns}
                              canDelete={canDelete}
                              isSelected={selected.has(task.id)}
                              isDone={isDone(task)}
                              commentCount={commentCounts[task.id] ?? 0}
                              deleteRequested={requestedDeleteIds.has(task.id)}
                              onToggleSelect={toggleSelected}
                              onOpenTask={onOpenTask}
                              onPatch={patch}
                              onDelete={handleDeleteTask}
                              onRequestDelete={handleRequestDelete}
                            />
                          ))}
                          <tr>
                            <td colSpan={colSpan} className="px-3 py-2">
                              {/* Typing and pressing Enter still works, but it
                                  is no longer the only way in: Add commits the
                                  line, and Add with details opens the full form
                                  with a confirm button. */}
                              <div className="flex items-center gap-2">
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
                                  aria-label={`Add a task to ${category.name}`}
                                  className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAddTask(category.id)}
                                  disabled={!(newTaskName[category.id] ?? "").trim()}
                                >
                                  <Plus className="size-3.5" />
                                  Add
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setAddTaskTo(category)}
                                >
                                  Add with details…
                                </Button>
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

        {categories.length === 0 && (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No categories yet — use <strong>Add category</strong> at the top of this page to make
            the first one.
          </p>
        )}
      </div>

      {/* Keyed by category so reopening it for a different group starts from a
          blank form rather than the last one's half-typed fields. */}
      {addTaskTo && (
        <NewTaskDialog
          key={addTaskTo.id}
          projectId={projectId}
          categoryId={addTaskTo.id === UNCATEGORIZED.id ? null : addTaskTo.id}
          categoryName={addTaskTo.name}
          statuses={statuses}
          members={members}
          initialName={newTaskName[addTaskTo.id] ?? ""}
          open
          onOpenChange={(open) => {
            if (!open) setAddTaskTo(null);
          }}
          onCreated={(task) => {
            onTasksChange((prev) => upsertById(prev, task));
            setNewTaskName((prev) => ({ ...prev, [addTaskTo.id]: "" }));
          }}
        />
      )}

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-3 bottom-3 z-30 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border bg-popover px-3 py-2.5 shadow-lg sm:inset-x-0 sm:bottom-4 sm:px-4"
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
            {canDelete ? (
              <Button size="sm" variant="destructive" onClick={bulkDelete}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={bulkRequestDelete}>
                <Clock className="size-3.5" />
                Request delete
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
