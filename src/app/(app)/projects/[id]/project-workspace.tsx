"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LayoutDashboard, LayoutGrid, Table as TableIcon } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import type { ImportBatch } from "@/lib/imports";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import { listComments } from "./comment-actions";
import { ExportMenu } from "./export-menu";
import { ImportDialog } from "./import-dialog";
import { TableView } from "./table-view";
import { TaskSheet } from "./task-sheet";

// Table is the default view — Kanban (dnd-kit) and Dashboard (recharts) are
// only ever needed once someone actually switches to that tab, so they're
// loaded on demand instead of bundled with the default Table view.
const KanbanView = dynamic(() => import("./kanban-view").then((m) => m.KanbanView), {
  loading: () => <Skeleton className="h-96 w-full rounded-2xl" />,
});
const ProjectDashboard = dynamic(
  () => import("./project-dashboard").then((m) => m.ProjectDashboard),
  { loading: () => <Skeleton className="h-96 w-full rounded-2xl" /> },
);

export function ProjectWorkspace({
  projectId,
  projectName,
  initialCategories,
  initialTasks,
  statuses,
  members,
  initialCommentCounts,
  initialLabels,
  canDelete,
  canImport,
  importBatches,
  initialTaskId,
  initialImportBatchId,
  currentUserName,
  organizationName,
}: {
  projectId: string;
  projectName: string;
  initialCategories: CategoryRecord[];
  initialTasks: TaskRecord[];
  statuses: Status[];
  members: { id: string; full_name: string | null; role: string }[];
  initialCommentCounts: Record<string, number>;
  initialLabels: { id: string; project_id: string; name: string; color: string }[];
  canDelete: boolean;
  canImport: boolean;
  importBatches: ImportBatch[];
  initialTaskId?: string;
  initialImportBatchId?: string;
  currentUserName: string | null;
  organizationName: string | null;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [tasks, setTasks] = useState(initialTasks);
  const [commentCounts, setCommentCounts] = useState(initialCommentCounts);
  const [labels] = useState(initialLabels);
  const [view, setView] = useState<"table" | "kanban" | "dashboard">("table");
  // `?task=<id>` — following a notification lands here with the drawer already
  // open on the task the notification was about.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        (payload) => {
          setTasks((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((t) => t.id !== (payload.old as TaskRecord).id);
            }
            const incoming = payload.new as TaskRecord;
            const exists = prev.some((t) => t.id === incoming.id);
            return exists
              ? prev.map((t) => (t.id === incoming.id ? incoming : t))
              : [...prev, incoming];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `project_id=eq.${projectId}` },
        (payload) => {
          setCategories((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as CategoryRecord).id);
            }
            const incoming = payload.new as CategoryRecord;
            const exists = prev.some((c) => c.id === incoming.id);
            return exists
              ? prev.map((c) => (c.id === incoming.id ? incoming : c))
              : [...prev, incoming];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { task_id: string } | undefined;
          if (!row) return;
          setCommentCounts((prev) => {
            const current = prev[row.task_id] ?? 0;
            const next =
              payload.eventType === "DELETE" ? Math.max(0, current - 1) : current + (payload.eventType === "INSERT" ? 1 : 0);
            return { ...prev, [row.task_id]: next };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Stable identities matter here: TableView's rows are memoised, and a fresh
  // closure on every render of this component would defeat that entirely.
  const updateTaskLocal = useCallback((taskId: string, patch: Partial<TaskRecord>) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }, []);

  const handleOpenTask = useCallback((task: TaskRecord) => {
    setSelectedTaskId(task.id);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="table">
              <TableIcon className="size-3.5" />
              Table
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <LayoutGrid className="size-3.5" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="size-3.5" />
              Dashboard
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <HelpTip topic="tasks">
          <strong>Table</strong> groups tasks under their categories and lets you edit inline.
          <strong> Kanban</strong> shows the same tasks as cards you drag between status columns.
          <strong> Dashboard</strong> charts this project on its own.
        </HelpTip>
        </div>

        {view !== "dashboard" && (
          <div className="flex items-center gap-2">
            {canImport && (
              <>
                <ImportDialog projectId={projectId} categories={categories} />
                <HelpTip topic="import-history">
                  Bring tasks in from a CSV, Excel or JSON file. Every import is recorded in
                  Settings → Import History, and you can filter the table to one import later.
                </HelpTip>
              </>
            )}
            <ExportMenu
              projectId={projectId}
              projectName={projectName}
              categories={categories}
              tasks={tasks}
              statuses={statuses}
              generatedBy={currentUserName}
              organizationName={organizationName}
            />
            <HelpTip topic="reports">
              PDF is the report you hand to someone — grouped by category, colour-coded, and
              stamped with your name. Excel is a flat sheet. JSON is a full backup.
            </HelpTip>
          </div>
        )}
      </div>

      {view === "table" && (
        <TableView
          projectId={projectId}
          categories={categories}
          tasks={tasks}
          statuses={statuses}
          canDelete={canDelete}
          commentCounts={commentCounts}
          onCategoriesChange={setCategories}
          onTasksChange={setTasks}
          onTaskUpdate={updateTaskLocal}
          onOpenTask={handleOpenTask}
          importBatches={importBatches}
          initialImportBatchId={initialImportBatchId}
        />
      )}
      {view === "kanban" && (
        <KanbanView
          projectId={projectId}
          categories={categories}
          tasks={tasks}
          statuses={statuses}
          commentCounts={commentCounts}
          onTasksChange={setTasks}
          onOpenTask={handleOpenTask}
        />
      )}
      {view === "dashboard" && (
        <ProjectDashboard
          tasks={tasks}
          categories={categories}
          statuses={statuses}
          members={members}
        />
      )}

      <TaskSheet
        task={selectedTask}
        statuses={statuses}
        members={members}
        allTasks={tasks}
        projectLabels={labels}
        canDelete={canDelete}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        onTaskChange={updateTaskLocal}
        onCommentsChange={(comments) => {
          if (!selectedTask) return;
          setCommentCounts((prev) => ({ ...prev, [selectedTask.id]: comments.length }));
        }}
        fetchComments={listComments}
      />
    </div>
  );
}
