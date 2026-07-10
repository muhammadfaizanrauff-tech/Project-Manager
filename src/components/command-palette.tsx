"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, FolderKanban, Search } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchWorkspace, type SearchResults } from "@/app/search-actions";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ projects: [], tasks: [] });
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ projects: [], tasks: [] });
    }
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchWorkspace(query).then(setResults);
      } else {
        setResults({ projects: [], tasks: [] });
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasResults = results.projects.length > 0 || results.tasks.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects and tasks…"
            className="border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {!hasResults && query.trim().length >= 2 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No results.</p>
          )}
          {!hasResults && query.trim().length < 2 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          )}

          {results.projects.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Projects</p>
              {results.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => go(`/projects/${p.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <FolderKanban className="size-4 text-primary" />
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {results.tasks.length > 0 && (
            <div>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Tasks</p>
              {results.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => go(`/projects/${t.project_id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="truncate">
                    #{t.serial_no} {t.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
