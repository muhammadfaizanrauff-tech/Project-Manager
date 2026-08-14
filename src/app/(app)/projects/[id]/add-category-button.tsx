"use client";

import { useState, useTransition } from "react";
import { FolderPlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryRecord } from "@/lib/tasks";
import { createCategory } from "./task-actions";

/**
 * Adding a category from the toolbar, alongside Import and Export, rather than
 * from a link buried under the last group of tasks.
 *
 * `pending` gates the submit button as well as the handler: the duplicate
 * categories people were complaining about started as a second click landing
 * before the first insert came back. The server action is idempotent now too
 * (task-actions.ts), so a duplicate name returns the existing category instead
 * of creating a second one — this just keeps it from getting that far.
 */
export function AddCategoryButton({
  projectId,
  categories,
  onCreated,
}: {
  projectId: string;
  categories: CategoryRecord[];
  onCreated: (category: CategoryRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;

    const clash = categories.find(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      setError(`"${clash.name}" already exists in this project.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createCategory(projectId, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) onCreated(result.data as CategoryRecord);
      setName("");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FolderPlus className="size-3.5" />
        Add category
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a category</DialogTitle>
          <DialogDescription>
            Categories group the tasks in this project. Each name can only be used once.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-category-name">Category name</Label>
          <Input
            id="new-category-name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Design"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
