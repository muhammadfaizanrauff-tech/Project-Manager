import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";

import { LOGO_PNG_BASE64 } from "@/lib/logo-base64";
import type { CategoryRecord, Status, TaskRecord } from "@/lib/tasks";

export type ExportRow = {
  serial: number;
  category: string;
  name: string;
  description: string;
  priority: string;
  status: string;
  statusColor: string;
  dueDate: string;
  created: string;
};

export function buildExportRows(
  categories: CategoryRecord[],
  tasks: TaskRecord[],
  statuses: Status[],
): ExportRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  return [...tasks]
    .sort((a, b) => a.serial_no - b.serial_no)
    .map((t) => {
      const status = t.status_id ? statusById.get(t.status_id) : undefined;
      return {
        serial: t.serial_no,
        category: t.category_id
          ? categoryById.get(t.category_id) ?? "Uncategorized"
          : "Uncategorized",
        name: t.name,
        description: t.description ?? "",
        priority: t.priority,
        status: status?.label ?? "",
        // Carried through so the PDF can tint the Status cell with the very
        // same colour the app shows, rather than a second hardcoded palette
        // that would drift the moment someone edits a status in Settings.
        statusColor: status?.color ?? "#94a3b8",
        dueDate: t.due_date ?? "",
        created: new Date(t.created_at).toLocaleDateString("en-US"),
      };
    });
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

// ── PDF colour helpers ────────────────────────────────────────────────────

type RGB = [number, number, number];

/** "#16a34a" → [22, 163, 74]. Falls back to slate on anything unparseable. */
function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (full.length !== 6) return [148, 163, 184];
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [148, 163, 184];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A pale version of a colour, for cell fills that text still reads over. */
function tint(rgb: RGB, amount = 0.85): RGB {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as RGB;
}

/** Darkened, for text that has to stay legible on the tint above. */
function shade(rgb: RGB, amount = 0.35): RGB {
  return rgb.map((c) => Math.round(c * (1 - amount))) as RGB;
}

const PRIORITY_COLORS: Record<string, RGB> = {
  high: [220, 38, 38], // red-600
  medium: [217, 119, 6], // amber-600
  low: [22, 163, 74], // green-600
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const BRAND: RGB = [99, 102, 241]; // indigo-500, matching the app's primary

type PdfSection = { category: string; rows: ExportRow[] };

/** Group by category, preserving the order categories appear in the rows. */
function groupByCategory(rows: ExportRow[]): PdfSection[] {
  const sections = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const list = sections.get(row.category) ?? [];
    list.push(row);
    sections.set(row.category, list);
  }
  return Array.from(sections, ([category, sectionRows]) => ({ category, rows: sectionRows }));
}

/**
 * The project report.
 *
 * Laid out as one table per category with its own heading and a per-category
 * summary line, rather than a single flat list — the way people actually read
 * a project. Priority and Status cells are colour-coded, Status using the very
 * colour configured in Settings → Statuses. Every page is stamped with who
 * generated it and when.
 */
export function exportToPdf(
  projectName: string,
  rows: ExportRow[],
  options: { generatedBy?: string | null; organizationName?: string | null } = {},
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const generatedBy = options.generatedBy?.trim() || "Unknown user";

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 26, "F");

  try {
    doc.addImage(LOGO_PNG_BASE64, "PNG", 12, 6, 14, 14);
  } catch {
    // logo embed is best-effort; report still generates without it
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(projectName, 31, 13);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    [options.organizationName, "Task report"].filter(Boolean).join("  ·  "),
    31,
    19.5,
  );

  // Right-aligned attribution — who asked for this report, and when.
  doc.setFontSize(8.5);
  doc.text(`Generated by ${generatedBy}`, pageWidth - 12, 13, { align: "right" });
  doc.text(generatedAt, pageWidth - 12, 19.5, { align: "right" });

  // ── Summary strip ───────────────────────────────────────────────────────
  const done = rows.filter((r) => r.status.toLowerCase() === "done").length;
  const highPriority = rows.filter((r) => r.priority === "high").length;
  const completion = rows.length > 0 ? Math.round((done / rows.length) * 100) : 0;

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text(
    `${rows.length} task${rows.length === 1 ? "" : "s"}   ·   ${done} completed (${completion}%)   ·   ${highPriority} high priority`,
    12,
    34,
  );

  const sections = groupByCategory(rows);
  let cursorY = 40;

  if (sections.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("This project has no tasks yet.", 12, cursorY + 6);
  }

  // ── One table per category ──────────────────────────────────────────────
  for (const section of sections) {
    const sectionDone = section.rows.filter((r) => r.status.toLowerCase() === "done").length;

    // Keep a heading with at least a row or two of its table rather than
    // stranding it at the foot of a page.
    if (cursorY > pageHeight - 45) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFillColor(...tint(BRAND, 0.9));
    doc.rect(12, cursorY - 5, pageWidth - 24, 9, "F");
    doc.setTextColor(...shade(BRAND, 0.25));
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text(section.category, 15, cursorY + 1.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${section.rows.length} task${section.rows.length === 1 ? "" : "s"} · ${sectionDone} done`,
      pageWidth - 15,
      cursorY + 1.2,
      { align: "right" },
    );

    autoTable(doc, {
      startY: cursorY + 7,
      margin: { left: 12, right: 12, bottom: 18 },
      head: [["#", "Task name", "Description", "Priority", "Status", "Due date", "Created"]],
      body: section.rows.map((r) => [
        String(r.serial),
        r.name,
        r.description,
        PRIORITY_LABELS[r.priority] ?? r.priority,
        r.status || "—",
        r.dueDate || "—",
        r.created,
      ]),
      styles: { fontSize: 8, cellPadding: 2.2, valign: "middle", lineColor: [226, 232, 240] },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 55, fontStyle: "bold" },
        2: { cellWidth: "auto" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 34, halign: "center" },
        5: { cellWidth: 24, halign: "center" },
        6: { cellWidth: 24, halign: "center" },
      },
      // Colour is applied per cell rather than per row: the whole point is
      // that Priority and Status are scannable at a glance down the page.
      didParseCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        const row = section.rows[data.row.index];
        if (!row) return;

        if (data.column.index === 3) {
          const base = PRIORITY_COLORS[row.priority] ?? [100, 116, 139];
          data.cell.styles.fillColor = tint(base, 0.86);
          data.cell.styles.textColor = shade(base, 0.15);
          data.cell.styles.fontStyle = "bold";
        }

        if (data.column.index === 4 && row.status) {
          const base = hexToRgb(row.statusColor);
          data.cell.styles.fillColor = tint(base, 0.84);
          data.cell.styles.textColor = shade(base, 0.3);
          data.cell.styles.fontStyle = "bold";
        }

        // Overdue and unfinished — worth catching the eye.
        if (data.column.index === 5 && row.dueDate) {
          const due = new Date(row.dueDate);
          const isDone = row.status.toLowerCase() === "done";
          if (!isDone && !Number.isNaN(due.getTime()) && due < new Date()) {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    // jspdf-autotable stashes where it finished on the doc it drew into.
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  // ── Footer on every page ────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${projectName} · generated by ${generatedBy} on ${generatedAt}`,
      12,
      pageHeight - 8,
    );
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 12, pageHeight - 8, {
      align: "right",
    });
  }

  const timestampFile = new Date().toISOString().slice(0, 10);
  doc.save(`${projectName.replace(/\s+/g, "-")}-${timestampFile}.pdf`);
}
