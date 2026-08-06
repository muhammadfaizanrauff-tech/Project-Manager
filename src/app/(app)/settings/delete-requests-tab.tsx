"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/help-tip";
import { SettingsSection } from "./settings-section";
import { approveDeleteRequest, rejectDeleteRequest } from "./actions";

export type DeleteRequestRow = {
  id: string;
  task_name: string;
  kind: "task" | "project";
  created_at: string;
  project: { id: string; name: string } | null;
  requester: { full_name: string | null } | null;
};

export function DeleteRequestsTab({ requests }: { requests: DeleteRequestRow[] }) {
  const [list, setList] = useState(requests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleApprove(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await approveDeleteRequest(id);
      if (!("error" in result)) setList((prev) => prev.filter((r) => r.id !== id));
      setPendingId(null);
    });
  }

  function handleReject(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await rejectDeleteRequest(id);
      if (!("error" in result)) setList((prev) => prev.filter((r) => r.id !== id));
      setPendingId(null);
    });
  }

  return (
    <SettingsSection
      title="Delete requests"
      description={
        <>
          Members can&apos;t delete tasks or projects themselves — they file a request here
          instead. Nothing is removed until you approve it.
          <HelpTip topic="requests" className="ml-1 align-text-bottom">
            Approving a <strong>project</strong> request deletes the project and everything in it.
            Approving a <strong>task</strong> request deletes just that task. Rejecting leaves
            everything untouched.
          </HelpTip>
        </>
      }
    >
      <div className="flex flex-col gap-2 rounded-2xl border p-3">
      {list.map((request) => (
        <div
          key={request.id}
          className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"
        >
          <div className="flex-1 text-sm">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              {request.task_name}
              {request.kind === "project" && (
                <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Whole project
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {request.kind === "project"
                ? "Deletes every task and category in it"
                : request.project?.name ?? "Unknown project"}{" "}
              · requested by {request.requester?.full_name ?? "someone"}
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="size-7 text-emerald-600 hover:text-emerald-700"
            disabled={pendingId === request.id}
            onClick={() => handleApprove(request.id)}
            aria-label="Approve deletion"
          >
            {pendingId === request.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-7 text-destructive hover:text-destructive"
            disabled={pendingId === request.id}
            onClick={() => handleReject(request.id)}
            aria-label="Reject request"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {list.length === 0 && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">No pending delete requests.</p>
      )}
      </div>
    </SettingsSection>
  );
}
