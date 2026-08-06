"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";

export function ExportMenu({
  projectName,
  categories,
  tasks,
  statuses,
}: {
  projectName: string;
  categories: CategoryRecord[];
  tasks: TaskRecord[];
  statuses: Status[];
}) {
  // jspdf/jspdf-autotable/xlsx are sizeable and only ever needed once someone
  // actually exports — load them on demand instead of in the Table view's
  // default bundle.
  async function handleExport(format: "excel" | "pdf") {
    const { buildExportRows, exportToExcel, exportToPdf } = await import("@/lib/export-utils");
    const rows = buildExportRows(categories, tasks, statuses);
    if (format === "excel") exportToExcel(projectName, rows);
    else exportToPdf(projectName, rows);
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
