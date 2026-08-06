"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, FileUp, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HelpTip } from "@/components/help-tip";
import type { ImportBatch } from "@/lib/imports";

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  project: "Project import",
  global: "Global import",
  csv: "CSV",
  json: "JSON restore",
};

export function ImportsTab({ batches }: { batches: ImportBatch[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) =>
      [b.file_name, b.project_name ?? "", b.imported_by_name ?? "", b.source]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [batches, query]);

  const totalTasks = batches.reduce((sum, b) => sum + b.created_count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every CSV and Excel import ever run, with the file name, the exact time, who ran it and
          how many tasks it created. Open one to see only the tasks that came in with it.
          <HelpTip topic="import-history" className="ml-1 align-text-bottom">
            Each import is recorded as a batch, and every task it created is tagged with that
            batch — so you can always trace a task back to the file it arrived in.
          </HelpTip>
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{batches.length}</strong> import
            {batches.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="text-foreground">{totalTasks}</strong> tasks created
          </span>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by file, project or person…"
          className="h-8 pl-8 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 rounded-2xl border-dashed py-12 text-center">
          <FileUp className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {batches.length === 0
              ? "Nothing has been imported yet."
              : "No imports match that search."}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Imported by</th>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Tasks</th>
                <th className="w-32 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((batch) => (
                <tr key={batch.id} className="border-t align-top">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      <FileUp className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="max-w-56 truncate">{batch.file_name}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {SOURCE_LABELS[batch.source] ?? batch.source}
                    </span>
                    {batch.warnings.length > 0 && (
                      <button
                        onClick={() => setExpanded(expanded === batch.id ? null : batch.id)}
                        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:underline dark:text-amber-400"
                      >
                        <AlertTriangle className="size-3" />
                        {batch.warnings.length} warning
                        {batch.warnings.length === 1 ? "" : "s"}
                      </button>
                    )}
                    {expanded === batch.id && batch.warnings.length > 0 && (
                      <ul className="mt-1.5 max-w-md list-disc space-y-0.5 rounded-lg bg-amber-500/10 py-2 pl-6 pr-3 text-[11px] text-amber-700 dark:text-amber-300">
                        {batch.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {batch.project_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {batch.imported_by_name ?? "Unknown"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(batch.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary" className="rounded-full border-none font-normal">
                      {batch.created_count}
                      {batch.row_count !== batch.created_count && (
                        <span className="ml-1 opacity-60">of {batch.row_count}</span>
                      )}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      nativeButton={false}
                      render={
                        <Link href={`/projects/${batch.project_id}?import=${batch.id}`} />
                      }
                    >
                      View tasks
                      <ArrowRight className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
