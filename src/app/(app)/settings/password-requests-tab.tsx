"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsSection } from "./settings-section";
import {
  approvePasswordRequest,
  rejectPasswordRequest,
  revealRequestedPassword,
} from "./actions";

export type PasswordRequestRow = {
  id: string;
  created_at: string;
  user: { id: string; full_name: string | null } | null;
};

function RequestedPasswordCell({ requestId }: { requestId: string }) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (visible) {
      setVisible(false);
      return;
    }
    startTransition(async () => {
      const result = await revealRequestedPassword(requestId);
      if (result.password) {
        setPassword(result.password);
        setVisible(true);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
      title="Show the password they asked for"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : visible ? (
        <EyeOff className="size-3.5" />
      ) : (
        <Eye className="size-3.5" />
      )}
      {visible ? password : "••••••••"}
    </button>
  );
}

export function PasswordRequestsTab({ requests }: { requests: PasswordRequestRow[] }) {
  const [list, setList] = useState(requests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function resolve(id: string, action: typeof approvePasswordRequest) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if ("error" in result) setError(result.error ?? "Something went wrong.");
      else setList((prev) => prev.filter((r) => r.id !== id));
      setPendingId(null);
    });
  }

  return (
    <SettingsSection
      title="Password requests"
      description="When someone changes their own password it waits here. Their old password keeps working until you approve."
    >
      <div className="flex flex-col gap-2 rounded-2xl border p-3">
        {list.map((request) => (
          <div
            key={request.id}
            className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"
          >
            <div className="min-w-40 flex-1 text-sm">
              <p className="font-medium">{request.user?.full_name ?? "Unknown user"}</p>
              <p className="text-xs text-muted-foreground">
                Asked {new Date(request.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <RequestedPasswordCell requestId={request.id} />
            <Button
              size="icon"
              variant="outline"
              className="size-7 text-emerald-600 hover:text-emerald-700"
              disabled={pendingId === request.id}
              onClick={() => resolve(request.id, approvePasswordRequest)}
              aria-label="Approve password change"
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
              onClick={() => resolve(request.id, rejectPasswordRequest)}
              aria-label="Reject password change"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No pending password requests.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
