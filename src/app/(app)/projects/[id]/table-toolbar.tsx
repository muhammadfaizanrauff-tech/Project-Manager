"use client";

import { Columns3, Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PRIORITY_STYLES } from "@/components/task-chips";
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
};

export function TableToolbar({
  statuses,
  filters,
  onFiltersChange,
  visibleColumns,
  onVisibleColumnsChange,
}: {
  statuses: Status[];
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  visibleColumns: Set<ColumnKey>;
  onVisibleColumnsChange: (columns: Set<ColumnKey>) => void;
}) {
  const activeFilterCount = filters.priorities.length + filters.statusIds.length;

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
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full gap-1.5 text-muted-foreground"
              onClick={() => onFiltersChange({ priorities: [], statusIds: [] })}
            >
              <X className="size-3.5" />
              Clear filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

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
