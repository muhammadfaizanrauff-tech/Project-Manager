import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ImportBatch = {
  id: string;
  project_id: string;
  project_name: string | null;
  file_name: string;
  source: string;
  row_count: number;
  created_count: number;
  warnings: string[];
  imported_by: string | null;
  imported_by_name: string | null;
  created_at: string;
};

type ImportBatchQueryRow = {
  id: string;
  project_id: string;
  file_name: string;
  source: string;
  row_count: number;
  created_count: number;
  warnings: unknown;
  imported_by: string | null;
  created_at: string;
  project: { name: string } | { name: string }[] | null;
  importer: { full_name: string | null } | { full_name: string | null }[] | null;
};

const SELECT =
  "id, project_id, file_name, source, row_count, created_count, warnings, imported_by, created_at, project:project_id(name), importer:imported_by(full_name)";

function shape(row: ImportBatchQueryRow): ImportBatch {
  const project = row.project as unknown as { name: string } | null;
  const importer = row.importer as unknown as { full_name: string | null } | null;
  return {
    id: row.id,
    project_id: row.project_id,
    project_name: project?.name ?? null,
    file_name: row.file_name,
    source: row.source,
    row_count: row.row_count,
    created_count: row.created_count,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    imported_by: row.imported_by,
    imported_by_name: importer?.full_name ?? null,
    created_at: row.created_at,
  };
}

/** Every import the caller can see, newest first. RLS scopes it to their projects. */
export async function listImportBatches(limit = 200): Promise<ImportBatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_batches")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as ImportBatchQueryRow[]).map(shape);
}

/** Imports into one project — used by the project workspace's import filter. */
export async function listImportBatchesForProject(projectId: string): Promise<ImportBatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_batches")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as ImportBatchQueryRow[]).map(shape);
}
