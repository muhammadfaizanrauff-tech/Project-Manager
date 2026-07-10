"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createStatus, deleteStatus } from "./actions";

type StatusRow = { id: string; label: string; color: string; position: number };

export function StatusesTab({ statuses }: { statuses: StatusRow[] }) {
  const [list, setList] = useState(statuses);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!label.trim()) return;
    startTransition(async () => {
      const result = await createStatus(label.trim(), color);
      if (!("error" in result)) {
        setList((prev) => [...prev, { id: crypto.randomUUID(), label: label.trim(), color, position: prev.length }]);
        setLabel("");
      }
    });
  }

  function handleDelete(id: string) {
    setList((prev) => prev.filter((s) => s.id !== id));
    startTransition(() => {
      deleteStatus(id);
    });
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl border p-3">
        {list.map((status) => (
          <div key={status.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            <span className="flex-1 text-sm">{status.label}</span>
            <button
              onClick={() => handleDelete(status.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No statuses yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-md border"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="New status label"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}
