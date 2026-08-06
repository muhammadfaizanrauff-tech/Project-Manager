"use client";

import { useState } from "react";
import { Braces, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";
import { exportProjectJson } from "./json-actions";

function downloadBlob(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportMenu({
  projectId,
  projectName,
  categories,
  tasks,
  statuses,
  generatedBy,
  organizationName,
}: {
  projectId: string;
  projectName: string;
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
  /** Stamped on the PDF — whoever is signed in and asked for the report. */
  generatedBy?: string | null;
  organizationName?: string | null;
}) {
  const [exportingJson, setExportingJson] = useState(false);

  // Unlike Excel/PDF (built from what's already on screen), the JSON export
  // pulls the full project server-side — checklists, labels, comments and
  // time logs aren't loaded into the table view.
  async function handleJsonExport() {
    setExportingJson(true);
    const result = await exportProjectJson(projectId);
    setExportingJson(false);
    if ("error" in result) return;

    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `${projectName.replace(/\s+/g, "-")}-${timestamp}.json`,
      JSON.stringify(result.bundle, null, 2),
      "application/json",
    );
  }
  // jspdf/jspdf-autotable/xlsx are sizeable and only ever needed once someone
  // actually exports — load them on demand instead of in the Table view's
  // default bundle.
  async function handleExport(format: "excel" | "pdf") {
    const { buildExportRows, exportToExcel, exportToPdf } = await import("@/lib/export-utils");
    const rows = buildExportRows(categories, tasks, statuses);
    if (format === "excel") exportToExcel(projectName, rows);
    else exportToPdf(projectName, rows, { generatedBy, organizationName });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-3.5" />
        Download
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("excel")}>
          <FileSpreadsheet className="size-4" />
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("pdf")}>
          <FileText className="size-4" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleJsonExport} disabled={exportingJson}>
          {exportingJson ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Braces className="size-4" />
          )}
          Export as JSON (full backup)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
