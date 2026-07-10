"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Plus, Trash2, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMeetingLink, deleteMeetingLink } from "./actions";

type MeetingLink = { id: string; label: string; url: string };

export function MeetingLinksTab({
  links,
  canManage,
}: {
  links: MeetingLink[];
  canManage: boolean;
}) {
  const [list, setList] = useState(links);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!label.trim() || !url.trim()) return;
    startTransition(async () => {
      const result = await createMeetingLink(label.trim(), url.trim());
      if (!("error" in result)) {
        setList((prev) => [...prev, { id: crypto.randomUUID(), label: label.trim(), url: url.trim() }]);
        setLabel("");
        setUrl("");
      }
    });
  }

  function handleDelete(id: string) {
    setList((prev) => prev.filter((l) => l.id !== id));
    startTransition(() => {
      deleteMeetingLink(id);
    });
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl border p-3">
        {list.map((link) => (
          <div key={link.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
            <Video className="size-4 shrink-0 text-primary" />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center gap-1 text-sm font-medium hover:underline"
            >
              {link.label}
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
            {canManage && (
              <button
                onClick={() => handleDelete(link.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No meeting links yet.</p>
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Daily standup)"
          />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <Button size="sm" onClick={handleAdd} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
