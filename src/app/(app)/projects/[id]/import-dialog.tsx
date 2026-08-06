"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkImportTasks, type ImportRow, type ImportSummary } from "./import-actions";
import {
  importProjectJson,
  type JsonImportSummary,
  type ProjectBundle,
} from "./json-actions";

const TARGET_FIELDS: { key: keyof ImportRow; label: string; required?: boolean }[] = [
  { key: "name", label: "Task name", required: true },
  { key: "description", label: "Description" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "dueDate", label: "Due date" },
  { key: "category", label: "Category" },
];

// Category is mapped differently from the rest: instead of only pointing at a
// CSV column, you can drop every imported task into one category — an existing
// one, or a new one typed here (bulkImportTasks creates unknown categories by
// name, so nothing extra is needed to make it exist).
const COLUMN_FIELDS = TARGET_FIELDS.filter((f) => f.key !== "category");
const NEW_CATEGORY = "__new__";

type Step = "upload" | "map" | "preview" | "json-confirm" | "json-result" | "result";
type CategoryMode = "column" | "fixed";

export function ImportDialog({
  projectId,
  categories,
}: {
  projectId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<keyof ImportRow, string>>>({});
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("column");
  const [fixedCategory, setFixedCategory] = useState(
    categories[0]?.name ?? NEW_CATEGORY,
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | { error: string } | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [jsonResult, setJsonResult] = useState<JsonImportSummary | { error: string } | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  const resolvedFixedCategory =
    fixedCategory === NEW_CATEGORY ? newCategoryName.trim() : fixedCategory;
  const categoryReady = categoryMode === "column" || resolvedFixedCategory.length > 0;

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setCategoryMode("column");
    setFixedCategory(categories[0]?.name ?? NEW_CATEGORY);
    setNewCategoryName("");
    setResult(null);
    setBundle(null);
    setJsonResult(null);
    setUploadError(null);
  }

  async function handleFile(file: File) {
    setUploadError(null);

    // A JSON export carries its own structure, so it skips the column-mapping
    // step entirely and goes straight to a confirmation.
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = JSON.parse(await file.text()) as ProjectBundle;
        if (parsed?.version !== 1 || !Array.isArray(parsed.tasks)) {
          setUploadError("That JSON isn't a project export from this app.");
          return;
        }
        setBundle(parsed);
        setStep("json-confirm");
      } catch {
        setUploadError("That file isn't valid JSON.");
      }
      return;
    }

    // papaparse is only needed once someone actually picks a file — load it
    // on demand instead of in the Table view's default bundle.
    const { default: Papa } = await import("papaparse");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        setHeaders(fields);
        setRows(results.data);

        const auto: Partial<Record<keyof ImportRow, string>> = {};
        for (const target of TARGET_FIELDS) {
          const match = fields.find(
            (f) => f.trim().toLowerCase() === target.key.toLowerCase() ||
              f.trim().toLowerCase() === target.label.toLowerCase(),
          );
          if (match) auto[target.key] = match;
        }
        setMapping(auto);
        setStep("map");
      },
    });
  }

  function mappedRows(): ImportRow[] {
    return rows.map((row) => ({
      name: mapping.name ? row[mapping.name] ?? "" : "",
      description: mapping.description ? row[mapping.description] : undefined,
      priority: mapping.priority ? row[mapping.priority] : undefined,
      status: mapping.status ? row[mapping.status] : undefined,
      dueDate: mapping.dueDate ? row[mapping.dueDate] : undefined,
      category:
        categoryMode === "fixed"
          ? resolvedFixedCategory || undefined
          : mapping.category
            ? row[mapping.category]
            : undefined,
    }));
  }

  async function handleConfirm() {
    setImporting(true);
    const result = await bulkImportTasks(projectId, mappedRows());
    setImporting(false);
    setResult(result);
    setStep("result");
  }

  async function handleJsonConfirm() {
    if (!bundle) return;
    setImporting(true);
    const result = await importProjectJson(projectId, bundle);
    setImporting(false);
    setJsonResult(result);
    setStep("json-result");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
        else if ("created" in (result ?? {})) window.location.reload();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="size-3.5" />
        Import
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import tasks</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Upload a <strong>.csv</strong> of tasks (you&apos;ll map columns
              next), or a <strong>.json</strong> backup exported from this app
              to restore it as-is.
            </p>
            <Input
              type="file"
              accept=".csv,text/csv,.json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {uploadError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {uploadError}
              </p>
            )}
          </div>
        )}

        {step === "json-confirm" && bundle && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Restoring{" "}
              <strong className="text-foreground">{bundle.project?.name}</strong>, exported{" "}
              {new Date(bundle.exportedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
            <ul className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
              <li>{bundle.tasks.length} tasks</li>
              <li>{bundle.categories?.length ?? 0} categories</li>
              <li>{bundle.subtasks?.length ?? 0} checklist items</li>
              <li>{bundle.labels?.length ?? 0} labels</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Everything is added to this project — nothing existing is
              removed. Categories and labels with matching names are reused
              rather than duplicated.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={handleJsonConfirm} disabled={importing}>
                {importing && <Loader2 className="size-4 animate-spin" />}
                Import {bundle.tasks.length} tasks
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "json-result" && jsonResult && (
          <div className="flex flex-col gap-3">
            {"error" in jsonResult ? (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {jsonResult.error}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Restored {jsonResult.tasks} tasks, {jsonResult.categories} new
                  categories, {jsonResult.subtasks} checklist items.
                </div>
                {jsonResult.warnings.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="size-3.5" />
                      Notes
                    </span>
                    <ul className="list-inside list-disc">
                      {jsonResult.warnings.slice(0, 8).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <DialogFooter>
              <Button onClick={() => window.location.reload()}>Done</Button>
            </DialogFooter>
          </div>
        )}

        {step === "map" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Match each field to a column from your CSV ({rows.length} rows found).
            </p>
            <div className="flex flex-col gap-2.5">
              {COLUMN_FIELDS.map((field) => (
                <div key={field.key} className="grid grid-cols-2 items-center gap-3">
                  <Label>
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] ?? "__skip__"}
                    onValueChange={(v) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: v === "__skip__" ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Don't import" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">Don&apos;t import</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <div className="flex flex-col gap-2.5 rounded-lg border p-3">
                <div className="grid grid-cols-2 items-center gap-3">
                  <Label>Category</Label>
                  <Select
                    value={categoryMode}
                    onValueChange={(v) => setCategoryMode(v === "fixed" ? "fixed" : "column")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="column">Read from a column</SelectItem>
                      <SelectItem value="fixed">Put them all in one</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {categoryMode === "column" ? (
                  <div className="grid grid-cols-2 items-center gap-3">
                    <Label className="text-muted-foreground">Column</Label>
                    <Select
                      value={mapping.category ?? "__skip__"}
                      onValueChange={(v) =>
                        setMapping((prev) => ({
                          ...prev,
                          category: !v || v === "__skip__" ? undefined : String(v),
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Don't import" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">Don&apos;t import</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 items-center gap-3">
                    <Label className="text-muted-foreground">Category</Label>
                    <Select
                      value={fixedCategory}
                      onValueChange={(v) => v && setFixedCategory(String(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={NEW_CATEGORY}>+ New category…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {categoryMode === "fixed" && fixedCategory === NEW_CATEGORY && (
                  <div className="grid grid-cols-2 items-center gap-3">
                    <Label className="text-muted-foreground">Name it</Label>
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Q3 Backlog"
                    />
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {categoryMode === "column"
                    ? "Each task goes into the category named in that column. Categories that don't exist yet get created."
                    : resolvedFixedCategory
                      ? `All ${rows.length} tasks go into "${resolvedFixedCategory}".`
                      : "Name the new category to continue."}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                disabled={!mapping.name || !categoryReady}
                onClick={() => setStep("preview")}
              >
                Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Previewing the first 5 of {rows.length} rows.
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {TARGET_FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-1.5 text-left font-medium">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows()
                    .slice(0, 5)
                    .map((row, i) => (
                      <tr key={i} className="border-t">
                        {TARGET_FIELDS.map((f) => (
                          <td key={f.key} className="max-w-32 truncate px-2 py-1.5">
                            {row[f.key] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={importing}>
                {importing && <Loader2 className="size-4 animate-spin" />}
                Import {rows.length} tasks
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-3">
            {"error" in result ? (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {result.error}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Imported {result.created} task{result.created === 1 ? "" : "s"}.
                </div>
                {result.warnings.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="size-3.5" />
                      {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
                    </span>
                    <ul className="list-inside list-disc">
                      {result.warnings.slice(0, 8).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <DialogFooter>
              <Button onClick={() => window.location.reload()}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
