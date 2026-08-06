"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Upload } from "lucide-react";

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
import {
  bulkImportTasks,
  type ImportRow,
  type ImportSummary,
} from "@/app/(app)/projects/[id]/import-actions";
import {
  createCategoryQuick,
  createProjectQuick,
  listCategoriesForProject,
  listProjectsForImport,
} from "./import-data-actions";

const TARGET_FIELDS: { key: keyof ImportRow; label: string; required?: boolean }[] = [
  { key: "name", label: "Task name", required: true },
  { key: "description", label: "Description" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "dueDate", label: "Due date" },
  { key: "category", label: "Category" },
];

type Step = "project" | "category" | "upload" | "map" | "preview" | "result";

export function GlobalImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("project");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<keyof ImportRow, string>>>({});
  const [result, setResult] = useState<ImportSummary | { error: string } | null>(null);

  useEffect(() => {
    if (open) listProjectsForImport().then(setProjects);
  }, [open]);

  function reset() {
    setStep("project");
    setProjectId(null);
    setProjectName("");
    setNewProjectName("");
    setCategoryName(null);
    setNewCategoryName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setError(null);
  }

  async function handleSelectProject(id: string) {
    setError(null);
    setProjectId(id);
    const project = projects.find((p) => p.id === id);
    setProjectName(project?.name ?? "");
    const cats = await listCategoriesForProject(id);
    setCategories(cats);
    setStep("category");
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    setPending(true);
    const result = await createProjectQuick(name);
    setPending(false);
    if ("error" in result) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setProjects((prev) => [...prev, result.data]);
    await handleSelectProject(result.data.id);
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || !projectId) return;
    setPending(true);
    const result = await createCategoryQuick(projectId, name);
    setPending(false);
    if ("error" in result) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setCategories((prev) => [...prev, result.data]);
    setCategoryName(result.data.name);
    setStep("upload");
  }

  async function handleFile(file: File) {
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
            (f) =>
              f.trim().toLowerCase() === target.key.toLowerCase() ||
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
      category: mapping.category ? row[mapping.category] : categoryName ?? undefined,
    }));
  }

  async function handleConfirm() {
    if (!projectId) return;
    setPending(true);
    const result = await bulkImportTasks(projectId, mappedRows());
    setPending(false);
    setResult(result);
    setStep("result");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
        else if (result && "created" in result) window.location.reload();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="size-3.5" />
        Import Tasks
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import tasks from CSV</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {step === "project" && (
          <div className="flex flex-col gap-3">
            <Label>Choose a project</Label>
            <Select onValueChange={(v) => v && handleSelectProject(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an existing project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or create a new project
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project name"
              />
              <Button size="sm" disabled={pending || !newProjectName.trim()} onClick={handleCreateProject}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create
              </Button>
            </div>
          </div>
        )}

        {step === "category" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Project: <span className="font-medium text-foreground">{projectName}</span>
            </p>
            <Label>Default category for imported tasks</Label>
            <Select
              onValueChange={(v) => {
                const cat = categories.find((c) => c.id === v);
                setCategoryName(cat?.name ?? null);
                setStep("upload");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an existing category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or create a new category
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
              />
              <Button size="sm" disabled={pending || !newCategoryName.trim()} onClick={handleCreateCategory}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              If your CSV has its own Category column, you can map it next and it will
              override this default per row.
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("project")}>
                Back
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "upload" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Project: <span className="font-medium text-foreground">{projectName}</span>
              {categoryName && (
                <>
                  {" "}
                  · Category: <span className="font-medium text-foreground">{categoryName}</span>
                </>
              )}
            </p>
            <Label>Upload CSV file</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("category")}>
                Back
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "map" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Match each field to a column from your CSV ({rows.length} rows found).
            </p>
            <div className="flex flex-col gap-2.5">
              {TARGET_FIELDS.map((field) => (
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
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button disabled={!mapping.name} onClick={() => setStep("preview")}>
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
              <Button onClick={handleConfirm} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
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
                  Imported {result.created} task{result.created === 1 ? "" : "s"} into{" "}
                  {projectName}.
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
              {projectId && (
                <Button variant="outline" render={<a href={`/projects/${projectId}`} />}>
                  Go to project
                </Button>
              )}
              <Button onClick={() => window.location.reload()}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
