"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
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
import { CalendarDays, ChevronLeft, ChevronRight, MessageSquare, Plus } from "lucide-react";

import { PriorityChip } from "@/components/task-chips";
import { upsertById } from "@/lib/utils";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import { createTask, updateTask } from "./task-actions";

/** Stand-in ids for "this task has no category" / "no status yet", so both can
 *  be a real column or section instead of a special case in every branch. */
const NO_CATEGORY = "__none__";
const NO_STATUS = "__nostatus__";

const CATEGORY_ACCENTS = ["#2383e2", "#d9730d", "#448361", "#6940a5", "#c14c8a", "#0f7b6c"];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
}

/** Droppable ids are addresses: a card lands on a task, on a category section,
 *  or on the bare column, and each of those has to resolve to the same pair of
 *  (status, category) that the drop should write. Encoding the pair into the id
 *  keeps that resolution in one function (`resolveTarget`) instead of three. */
function columnId(statusKey: string) {
  return `col::${statusKey}`;
}
function sectionId(statusKey: string, categoryKey: string) {
  return `sec::${statusKey}::${categoryKey}`;
}

type Target = { statusKey: string; categoryKey: string };

function parseDroppableId(id: string): Target | null {
  if (id.startsWith("sec::")) {
    const [, statusKey, categoryKey] = id.split("::");
    return { statusKey, categoryKey };
  }
  if (id.startsWith("col::")) {
    return { statusKey: id.slice("col::".length), categoryKey: "" };
  }
  return null;
}

function keysOf(task: TaskRecord): Target {
  return {
    statusKey: task.status_id ?? NO_STATUS,
    categoryKey: task.category_id ?? NO_CATEGORY,
  };
}

/** Midnight today, so "overdue" is a whole-day question — a task due today is
 *  not late until tomorrow. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function TaskCard({
  task,
  commentCount,
  isDone,
  onOpen,
}: {
  task: TaskRecord;
  commentCount: number;
  /** Cards in a Done column never read as late, however old the due date is. */
  isDone: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const overdue = !isDone && !!task.due_date && new Date(task.due_date) < startOfToday();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      // A Notion board card: white, hairline, 6px corners, and a 1px lift that
      // deepens on hover. No colour until a property needs one.
      className="notion-card flex cursor-grab flex-col gap-2 rounded-md bg-card p-2.5 text-sm active:cursor-grabbing"
    >
      <p className="font-medium leading-snug text-card-foreground">{task.name}</p>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <PriorityChip priority={task.priority} />
        <span className="flex items-center gap-2">
          {commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3.5" />
              {commentCount}
            </span>
          )}
          {task.due_date && (
            <span
              className={`flex items-center gap-1 tabular-nums ${
                overdue ? "font-medium text-destructive" : ""
              }`}
              title={overdue ? "Past due" : undefined}
            >
              <CalendarDays className="size-3.5" />
              {new Date(task.due_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** "+ New" that becomes the task name field in place. Kept quiet until the
 *  column is hovered, the way Notion's is — except on touch, where there is no
 *  hover to reveal it with. */
function AddTaskRow({
  placeholder,
  draft,
  onDraftChange,
  onAdd,
}: {
  placeholder: string;
  draft: string | null;
  onDraftChange: (value: string | null) => void;
  onAdd: () => void;
}) {
  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => onDraftChange("")}
        className="flex items-center gap-1 rounded-sm px-0.5 py-1 text-xs text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/column:opacity-100"
      >
        <Plus className="size-3.5" />
        New
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => onDraftChange(e.target.value)}
      onBlur={() => (draft.trim() ? onAdd() : onDraftChange(null))}
      onKeyDown={(e) => {
        if (e.key === "Enter") onAdd();
        if (e.key === "Escape") onDraftChange(null);
      }}
      placeholder={placeholder}
      className="notion-card rounded-md bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
    />
  );
}

/** One category inside one status column — the "Design · 1" band the board is
 *  grouped by. It is its own droppable so dropping here writes *both* the
 *  column's status and this category, which is how a card moves sideways
 *  between categories without leaving the status it's in. */
function CategorySection({
  statusKey,
  category,
  tasks,
  commentCounts,
  isDone,
  onOpen,
  draft,
  onDraftChange,
  onAdd,
}: {
  statusKey: string;
  category: { id: string; name: string };
  tasks: TaskRecord[];
  commentCounts: Record<string, number>;
  isDone: boolean;
  onOpen: (task: TaskRecord) => void;
  draft: string | null;
  onDraftChange: (value: string | null) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: sectionId(statusKey, category.id),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              category.id === NO_CATEGORY ? "var(--muted-foreground)" : accentFor(category.id),
          }}
        />
        <span className="truncate text-xs font-medium text-muted-foreground">
          {category.name}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground/70">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-6 flex-col gap-1.5 rounded-md transition-colors ${
          isOver ? "bg-accent/70" : ""
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              commentCount={commentCounts[task.id] ?? 0}
              isDone={isDone}
              onOpen={() => onOpen(task)}
            />
          ))}
        </SortableContext>
      </div>

      <AddTaskRow
        placeholder={`New task in ${category.name}`}
        draft={draft}
        onDraftChange={onDraftChange}
        onAdd={onAdd}
      />
    </div>
  );
}

function StatusColumn({
  statusKey,
  label,
  color,
  sections,
  count,
  commentCounts,
  onOpen,
  drafts,
  onDraftChange,
  onAdd,
}: {
  statusKey: string;
  label: string;
  color: string | null;
  sections: { category: { id: string; name: string }; tasks: TaskRecord[] }[];
  count: number;
  commentCounts: Record<string, number>;
  onOpen: (task: TaskRecord) => void;
  /** Keyed by category id, already narrowed to this column by the parent. */
  drafts: Record<string, string>;
  onDraftChange: (categoryKey: string, value: string | null) => void;
  onAdd: (categoryKey: string) => void;
}) {
  // The column itself accepts a drop too, for the empty-column case and for the
  // gap under the last section. `categoryKey: ""` there means "keep whatever
  // category the card already had" — only the status changes.
  const { setNodeRef, isOver } = useDroppable({ id: columnId(statusKey) });

  // Status is matched by its label everywhere else in the app (statuses are a
  // configurable table, not an enum), so "is this the finished pile" is too.
  const isDone = label === "Done";

  return (
    <div className="group/column flex h-full w-[78vw] max-w-[17rem] shrink-0 flex-col gap-2 sm:w-[17rem]">
      {/* Outside the scrolling body on purpose: the stage name and its count
          stay readable while you scroll a hundred cards under them. */}
      <div className="flex shrink-0 items-center gap-2 px-0.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
        />
        <h3 className="truncate text-sm font-semibold">{label}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>

      <div
        ref={setNodeRef}
        // min-h-0 is what lets this shrink inside the flex column and scroll
        // itself instead of stretching the board past its frame.
        className={`thin-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-md p-1.5 transition-colors ${
          isOver ? "bg-accent/50" : "bg-muted/50"
        }`}
      >
        {sections.map(({ category, tasks }) => (
          <CategorySection
            key={category.id}
            statusKey={statusKey}
            category={category}
            tasks={tasks}
            commentCounts={commentCounts}
            isDone={isDone}
            onOpen={onOpen}
            draft={drafts[category.id] ?? null}
            onDraftChange={(value) => onDraftChange(category.id, value)}
            onAdd={() => onAdd(category.id)}
          />
        ))}

        {/* Nothing at this stage yet, so there's no category band to hang an
            add row off. Typing here files the task under Uncategorized — said
            plainly in the placeholder rather than guessing a category. */}
        {sections.length === 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="px-1 pt-2 text-xs text-muted-foreground/70">
              Drag tasks here, or add one.
            </p>
            <AddTaskRow
              placeholder="New task in Uncategorized"
              draft={drafts[NO_CATEGORY] ?? null}
              onDraftChange={(value) => onDraftChange(NO_CATEGORY, value)}
              onAdd={() => onAdd(NO_CATEGORY)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Where the board's horizontal scroll is, how much of it fits, and how much
 *  there is in total — everything the scroll guide draws itself from. */
type ScrollMetrics = { left: number; width: number; total: number };

/**
 * A board with a column per stage is usually wider than the window, and a
 * native scrollbar doesn't announce that until you go looking for it — people
 * miss whole stages sitting just off the right edge. This tracks the scroll so
 * the guide can say three things: which directions have more (edge fades),
 * how to step there (arrows), and where you are in the whole board (the rail).
 */
function useBoardScroll() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>({ left: 0, width: 1, total: 1 });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (el) setMetrics({ left: el.scrollLeft, width: el.clientWidth, total: el.scrollWidth });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    // Both ends matter: the window resizing changes what fits, and a column
    // gaining a card changes the total — neither fires a scroll event.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measure]);

  const scrollTo = useCallback((left: number, smooth = false) => {
    scrollerRef.current?.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /** One column plus the gap, so an arrow press lands on a column boundary. */
  const stepBy = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    const first = contentRef.current?.firstElementChild as HTMLElement | null;
    if (!scroller) return;
    const step = (first?.offsetWidth ?? 272) + 12;
    scrollTo(scroller.scrollLeft + direction * step, true);
  }, [scrollTo]);

  const maxLeft = Math.max(0, metrics.total - metrics.width);
  // A pixel of slack: sub-pixel layout means scrollLeft rarely hits maxLeft exactly.
  return {
    scrollerRef,
    contentRef,
    metrics,
    measure,
    scrollTo,
    stepBy,
    maxLeft,
    canScrollLeft: metrics.left > 1,
    canScrollRight: metrics.left < maxLeft - 1,
  };
}

function BoardArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll board left" : "Scroll board right"}
      className={`notion-floating absolute top-1/2 z-20 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground sm:grid ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * The board's own scrollbar, drawn where you'd actually look for it. It replaces
 * the native one (hidden by `.board-scroll`) rather than sitting next to it, so
 * it has to stay draggable — click or drag anywhere on the track to jump.
 */
function ScrollRail({
  metrics,
  maxLeft,
  onSeek,
}: {
  metrics: ScrollMetrics;
  maxLeft: number;
  onSeek: (left: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Nothing to guide when the whole board already fits.
  if (maxLeft <= 1) return null;

  // Floored so a very wide board still leaves something big enough to grab.
  const thumbPercent = Math.max((metrics.width / metrics.total) * 100, 8);
  const progress = metrics.left / maxLeft;

  function seek(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const thumbWidth = (thumbPercent / 100) * rect.width;
    const travel = rect.width - thumbWidth;
    if (travel <= 0) return;
    // Centre the thumb on the pointer, so the grab point doesn't jump.
    const ratio = (clientX - rect.left - thumbWidth / 2) / travel;
    onSeek(Math.min(Math.max(ratio, 0), 1) * maxLeft);
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
      }}
      className="group/rail relative mx-0.5 h-3 cursor-pointer touch-none select-none"
    >
      <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-border" />
      <div
        className="absolute top-1 h-1 rounded-full bg-muted-foreground/40 transition-colors group-hover/rail:bg-muted-foreground/70"
        style={{
          width: `${thumbPercent}%`,
          // Percentage of the *track*, so it never overruns the right end.
          left: `${progress * (100 - thumbPercent)}%`,
        }}
      />
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
  // Setter-shaped so handlers can update functionally off the latest state
  // rather than a value captured before an await, matching TableView.
  onTasksChange: Dispatch<SetStateAction<TaskRecord[]>>;
  onOpenTask: (task: TaskRecord) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Keyed "<statusKey>::<categoryKey>" — a draft belongs to the one section it
  // was opened in, so two open inputs on the board don't share a value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /**
   * The board is grouped by status first and category second: columns are the
   * stages (To Do → In Progress → Done), and inside a stage each category that
   * has work at that stage gets its own titled band. A category with three
   * tasks, one finished, therefore appears in two columns — twice under its own
   * name — rather than as a column of its own with the finished task buried in it.
   *
   * Only categories that actually have tasks in a column get a band, so a
   * fifteen-category project doesn't render fifteen empty headings per stage.
   * "No status" is the same deal: it's only a column when something is in it.
   */
  const columns = useMemo(() => {
    const ordered = [...categories].sort((a, b) => a.position - b.position);
    const categoryOrder = [
      ...ordered.map((c) => ({ id: c.id, name: c.name })),
      { id: NO_CATEGORY, name: "Uncategorized" },
    ];

    const byStatus = new Map<string, Map<string, TaskRecord[]>>();
    for (const task of tasks) {
      const { statusKey, categoryKey } = keysOf(task);
      let inStatus = byStatus.get(statusKey);
      if (!inStatus) byStatus.set(statusKey, (inStatus = new Map()));
      const bucket = inStatus.get(categoryKey);
      if (bucket) bucket.push(task);
      else inStatus.set(categoryKey, [task]);
    }

    const build = (statusKey: string, label: string, color: string | null) => {
      const inStatus = byStatus.get(statusKey);
      const sections = categoryOrder
        .map((category) => ({
          category,
          // Positions are per-category in the database, so two tasks in the
          // same category but different statuses can share one — serial_no is
          // the tiebreak that keeps the order stable between renders.
          tasks: [...(inStatus?.get(category.id) ?? [])].sort(
            (a, b) => a.position - b.position || a.serial_no - b.serial_no,
          ),
        }))
        .filter((section) => section.tasks.length > 0);

      return {
        statusKey,
        label,
        color,
        sections,
        count: sections.reduce((sum, s) => sum + s.tasks.length, 0),
      };
    };

    const result = [...statuses]
      .sort((a, b) => a.position - b.position)
      .map((status) => build(status.id, status.label, status.color));

    if (byStatus.has(NO_STATUS)) result.push(build(NO_STATUS, "No status", null));

    return result;
  }, [categories, tasks, statuses]);

  function tasksIn(statusKey: string, categoryKey: string) {
    return tasks
      .filter((t) => {
        const keys = keysOf(t);
        return keys.statusKey === statusKey && keys.categoryKey === categoryKey;
      })
      .sort((a, b) => a.position - b.position || a.serial_no - b.serial_no);
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

    const overId = String(over.id);
    const overTask = tasks.find((t) => t.id === overId);
    const target = overTask ? keysOf(overTask) : parseDroppableId(overId);
    if (!target) return;

    // Dropping on bare column space keeps the card's category and only moves it
    // between stages — the common case, and the one the user asks for by name.
    const statusKey = target.statusKey;
    const categoryKey = target.categoryKey || keysOf(activeTask).categoryKey;
    if (statusKey !== NO_STATUS && !statuses.some((s) => s.id === statusKey)) return;

    const destination = tasksIn(statusKey, categoryKey).filter((t) => t.id !== activeTask.id);
    const overIndex = overTask ? destination.findIndex((t) => t.id === overTask.id) : -1;
    const insertAt = overIndex === -1 ? destination.length : overIndex;
    destination.splice(insertAt, 0, activeTask);

    const patched = destination.map((t, i) => ({
      ...t,
      status_id: statusKey === NO_STATUS ? null : statusKey,
      category_id: categoryKey === NO_CATEGORY ? null : categoryKey,
      position: i,
    }));

    const untouched = tasks.filter((t) => {
      if (t.id === activeTask.id) return false;
      const keys = keysOf(t);
      return !(keys.statusKey === statusKey && keys.categoryKey === categoryKey);
    });

    onTasksChange([...untouched, ...patched]);

    const moved = patched.find((t) => t.id === activeTask.id)!;
    startTransition(() => {
      updateTask(projectId, moved.id, {
        status_id: moved.status_id,
        category_id: moved.category_id,
        position: moved.position,
      });
    });
  }

  /** The drafts for one column, re-keyed by category id for the column to use. */
  function draftsFor(statusKey: string) {
    const prefix = `${statusKey}::`;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(drafts)) {
      if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
    }
    return out;
  }

  function setDraft(statusKey: string, categoryKey: string, value: string | null) {
    const key = `${statusKey}::${categoryKey}`;
    setDrafts((prev) => {
      if (value === null) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }

  function handleAddTask(statusKey: string, categoryKey: string) {
    const key = `${statusKey}::${categoryKey}`;
    const name = (drafts[key] ?? "").trim();
    if (!name) {
      setDraft(statusKey, categoryKey, null);
      return;
    }
    // The input stays open and empty so a stage can be filled in one sitting.
    setDrafts((prev) => ({ ...prev, [key]: "" }));
    startTransition(async () => {
      const result = await createTask(
        projectId,
        categoryKey === NO_CATEGORY ? null : categoryKey,
        name,
        // Created where it was typed: a task added under Done is done.
        { status_id: statusKey === NO_STATUS ? null : statusKey },
      );
      // Functional, not [...tasks, …]: the closure captured `tasks` before the
      // await, so a Realtime update landing in between would be dropped.
      if (result.data) onTasksChange((prev) => upsertById(prev, result.data as TaskRecord));
    });
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const {
    scrollerRef,
    contentRef,
    metrics,
    measure,
    scrollTo,
    stepBy,
    maxLeft,
    canScrollLeft,
    canScrollRight,
  } = useBoardScroll();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          {/* The fades are the guide's quietest part and do the most work: a
              soft edge reads as "cut off, keep going", where a hard one reads
              as the end of the board. Never in the way of a card. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 ${
              canScrollRight ? "opacity-100" : "opacity-0"
            }`}
          />
          {canScrollLeft && <BoardArrow side="left" onClick={() => stepBy(-1)} />}
          {canScrollRight && <BoardArrow side="right" onClick={() => stepBy(1)} />}

          {/* A fixed frame rather than a page that grows: each column scrolls
              its own cards under a header that stays, which is what keeps a
              long stage readable and the board itself one screen. */}
          <div
            ref={scrollerRef}
            onScroll={measure}
            className="board-scroll flex h-[calc(100dvh-15rem)] min-h-[26rem] overflow-x-auto overflow-y-hidden"
          >
            <div ref={contentRef} className="flex h-full items-stretch gap-3">
              {columns.map((column) => (
                <StatusColumn
                  key={column.statusKey}
                  statusKey={column.statusKey}
                  label={column.label}
                  color={column.color}
                  sections={column.sections}
                  count={column.count}
                  commentCounts={commentCounts}
                  onOpen={onOpenTask}
                  drafts={draftsFor(column.statusKey)}
                  onDraftChange={(categoryKey, value) =>
                    setDraft(column.statusKey, categoryKey, value)
                  }
                  onAdd={(categoryKey) => handleAddTask(column.statusKey, categoryKey)}
                />
              ))}
            </div>
          </div>
        </div>

        <ScrollRail metrics={metrics} maxLeft={maxLeft} onSeek={(left) => scrollTo(left)} />
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="notion-floating rounded-md">
            <TaskCard
              task={activeTask}
              commentCount={commentCounts[activeTask.id] ?? 0}
              isDone={
                statuses.find((s) => s.id === activeTask.status_id)?.label === "Done"
              }
              onOpen={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
