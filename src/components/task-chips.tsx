"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/tasks";

export const PRIORITY_STYLES: Record<
  "high" | "medium" | "low",
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className:
      "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
  medium: {
    label: "Medium",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  },
  low: {
    label: "Low",
    className:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  },
};

export function PriorityChip({ priority }: { priority: "high" | "medium" | "low" }) {
  const style = PRIORITY_STYLES[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

export function PrioritySelect({
  value,
  onChange,
  disabled,
}: {
  value: "high" | "medium" | "low";
  onChange: (value: "high" | "medium" | "low") => void;
  disabled?: boolean;
}) {
  const style = PRIORITY_STYLES[value];
  return (
    <Select value={value} onValueChange={(v) => onChange(v as typeof value)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-auto w-auto gap-1 rounded-full border-none px-2 py-0.5 text-xs font-medium shadow-none",
          style.className,
        )}
      >
        <SelectValue>{style.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRIORITY_STYLES) as Array<keyof typeof PRIORITY_STYLES>).map(
          (key) => (
            <SelectItem key={key} value={key}>
              <PriorityChip priority={key} />
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

function statusChipStyle(color: string) {
  return {
    backgroundColor: `${color}26`,
    color,
  };
}

export function StatusChip({ status }: { status: Status | null | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        No status
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={statusChipStyle(status.color)}
    >
      {status.label}
    </span>
  );
}

export function StatusSelect({
  value,
  statuses,
  onChange,
  disabled,
}: {
  value: string | null;
  statuses: Status[];
  onChange: (statusId: string) => void;
  disabled?: boolean;
}) {
  const current = statuses.find((s) => s.id === value);

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => v && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="h-auto w-auto gap-1 rounded-full border-none px-2 py-0.5 text-xs font-semibold shadow-none"
        style={current ? statusChipStyle(current.color) : undefined}
      >
        <SelectValue placeholder="No status">{current?.label ?? "No status"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <StatusChip status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
