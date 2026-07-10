"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnProfile } from "./actions";

export function ProfileTab({
  role,
  fullName,
  email,
}: {
  role: string;
  fullName: string;
  email: string;
}) {
  const [name, setName] = useState(fullName);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await updateOwnProfile(name.trim());
      setSaved(true);
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Card className="gap-4 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input value={email} disabled />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </Card>

      <Card className="gap-3 rounded-2xl p-5 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={<Link href="/change-password" />}
        >
          <KeyRound className="size-3.5" />
          Change password
        </Button>

        {role === "admin" && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-yellow-600" />
            As Admin, your password is stored encrypted (not just hashed) so
            you can view/change any user&apos;s password. Enabling
            authenticator-app 2FA for this account is strongly recommended.
          </p>
        )}
      </Card>
    </div>
  );
}
