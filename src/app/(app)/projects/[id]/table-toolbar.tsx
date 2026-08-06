"use client";

import { Columns3, FileUp, Filter, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpTip } from "@/components/help-tip";
import { PRIORITY_STYLES } from "@/components/task-chips";
import type { ImportBatch } from "@/lib/imports";
import type { Status } from "@/lib/tasks";

export type ColumnKey = "description" | "priority" | "status" | "dueDate" | "comments";

export const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "dueDate", label: "Due date" },
  { key: "comments", label: "Comments" },
];

export type TaskFilters = {
  priorities: string[];
  statusIds: string[];
  /** When set, show only the tasks that arrived in this one import run. */
  importBatchId: string | null;
};

function formatBatchLabel(batch: ImportBatch) {
  const when = new Date(batch.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${batch.file_name} · ${when}`;
}

export function TableToolbar({
  statuses,
  filters,
  onFiltersChange,
  visibleColumns,
  onVisibleColumnsChange,
  search,
  onSearchChange,
  resultCount,
  importBatches,
}: {
  statuses: Status[];
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  visibleColumns: Set<ColumnKey>;
  onVisibleColumnsChange: (columns: Set<ColumnKey>) => void;
  search: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  importBatches: ImportBatch[];
}) {
  const activeFilterCount =
    filters.priorities.length + filters.statusIds.length + (filters.importBatchId ? 1 : 0);
  const activeBatch = importBatches.find((b) => b.id === filters.importBatchId);

  function togglePriority(p: string) {
    onFiltersChange({
      ...filters,
      priorities: filters.priorities.includes(p)
        ? filters.priorities.filter((v) => v !== p)
        : [...filters.priorities, p],
    });
  }

  function toggleStatus(id: string) {
    onFiltersChange({
      ...filters,
      statusIds: filters.statusIds.includes(id)
        ? filters.statusIds.filter((v) => v !== id)
        : [...filters.statusIds, id],
    });
  }

  function toggleColumn(key: ColumnKey) {
    const next = new Set(visibleColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onVisibleColumnsChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="h-8 pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {search && (
        <span className="text-xs text-muted-foreground">
          {resultCount} match{resultCount === 1 ? "" : "es"}
        </span>
      )}

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="size-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          }
        />
        <PopoverContent className="w-56">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Priority</p>
          {(Object.keys(PRIORITY_STYLES) as Array<keyof typeof PRIORITY_STYLES>).map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.priorities.includes(key)}
                onCheckedChange={() => togglePriority(key)}
              />
              {PRIORITY_STYLES[key].label}
            </label>
          ))}
          <p className="mb-1.5 mt-2 text-xs font-medium text-muted-foreground">Status</p>
          {statuses.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.statusIds.includes(s.id)}
                onCheckedChange={() => toggleStatus(s.id)}
              />
              {s.label}
            </label>
          ))}
          {importBatches.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                Imported batch
                <HelpTip topic="import-history">
                  Show only the tasks that came in from one particular file. Every import is kept
                  in the history with its file name, timestamp and who ran it.
                </HelpTip>
              </p>
              {importBatches.map((batch) => (
                <label
                  key={batch.id}
                  className="flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={filters.importBatchId === batch.id}
                    onCheckedChange={() =>
                      onFiltersChange({
                        ...filters,
                        // Radio-like: picking a second batch replaces the first,
                        // since a task belongs to exactly one import.
                        importBatchId: filters.importBatchId === batch.id ? null : batch.id,
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate">{batch.file_name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(batch.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {batch.imported_by_name ? ` · ${batch.imported_by_name}` : ""} ·{" "}
                      {batch.created_count} task{batch.created_count === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
              ))}
            </>
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full gap-1.5 text-muted-foreground"
              onClick={() =>
                onFiltersChange({ priorities: [], statusIds: [], importBatchId: null })
              }
            >
              <X className="size-3.5" />
              Clear filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {activeBatch && (
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary">
          <FileUp className="size-3" />
          <span className="max-w-48 truncate">{formatBatchLabel(activeBatch)}</span>
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, importBatchId: null })}
            aria-label="Show all tasks again"
            className="rounded-full p-0.5 hover:bg-primary/20"
          >
            <X className="size-3" />
          </button>
        </span>
      )}

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Columns3 className="size-3.5" />
              Columns
            </Button>
          }
        />
        <PopoverContent className="w-48">
          {ALL_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={visibleColumns.has(col.key)}
                onCheckedChange={() => toggleColumn(col.key)}
              />
              {col.label}
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
