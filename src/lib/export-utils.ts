import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";

export type ExportRow = {
  serial: number;
  category: string;
  name: string;
  description: string;
  priority: string;
  status: string;
  dueDate: string;
  created: string;
};

export function buildExportRows(
  categories: CategoryRecord[],
  tasks: TaskRecord[],
  statuses: Status[],
): ExportRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const statusById = new Map(statuses.map((s) => [s.id, s.label]));

  return [...tasks]
    .sort((a, b) => a.serial_no - b.serial_no)
    .map((t) => ({
      serial: t.serial_no,
      category: t.category_id ? categoryById.get(t.category_id) ?? "Uncategorized" : "Uncategorized",
      name: t.name,
      description: t.description ?? "",
      priority: t.priority,
      status: t.status_id ? statusById.get(t.status_id) ?? "" : "",
      dueDate: t.due_date ?? "",
      created: new Date(t.created_at).toLocaleDateString(),
    }));
}

export function exportToExcel(projectName: string, rows: ExportRow[]) {
  const sheetData = rows.map((r) => ({
    "#": r.serial,
    Category: r.category,
    "Task name": r.name,
    Description: r.description,
    Priority: r.priority,
    Status: r.status,
    "Due date": r.dueDate,
    Created: r.created,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks");

  const timestamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${projectName.replace(/\s+/g, "-")}-${timestamp}.xlsx`);
}

export function exportToPdf(projectName: string, rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const timestamp = new Date().toLocaleString();

  doc.setFontSize(14);
  doc.text(projectName, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${timestamp}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["#", "Category", "Task name", "Description", "Priority", "Status", "Due date", "Created"]],
    body: rows.map((r) => [
      r.serial,
      r.category,
      r.name,
      r.description,
      r.priority,
      r.status,
      r.dueDate,
      r.created,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241] },
  });

  const timestampFile = new Date().toISOString().slice(0, 10);
  doc.save(`${projectName.replace(/\s+/g, "-")}-${timestampFile}.pdf`);
}
