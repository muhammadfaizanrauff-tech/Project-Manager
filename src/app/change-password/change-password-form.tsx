"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPasswordReset,
  setNewPassword,
  verifyCurrentPassword,
} from "./actions";

type Step = "verify" | "new" | "reset-sent";

export function ChangePasswordForm({
  initialEmail,
  loggedIn,
  skipToNew,
}: {
  initialEmail?: string;
  loggedIn: boolean;
  skipToNew: boolean;
}) {
  const [step, setStep] = useState<Step>(skipToNew ? "new" : "verify");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleVerify(formData: FormData) {
    const emailValue = loggedIn
      ? email
      : String(formData.get("email") ?? "").trim();
    const currentPassword = String(formData.get("currentPassword") ?? "");
    setError(null);

    if (!emailValue || !currentPassword) {
      setError("Enter your email and current password.");
      return;
    }

    startTransition(async () => {
      const result = await verifyCurrentPassword(emailValue, currentPassword);
      if (result.ok) {
        setEmail(emailValue);
        setStep("new");
      } else {
        setEmail(emailValue);
        setError(result.error);
        setShowForgot(true);
      }
    });
  }

  function handleForgot() {
    setError(null);
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.ok) setStep("reset-sent");
      else setError(result.error);
    });
  }

  function handleSetNew(formData: FormData) {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await setNewPassword(newPassword);
      if (result && !result.ok) setError(result.error);
    });
  }

  if (step === "reset-sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium">{email}</span>,
          a password reset link has been sent. Open it to set a new password.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (step === "new") {
    return (
      <form action={handleSetNew} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Update password
        </Button>
      </form>
    );
  }

  return (
    <form action={handleVerify} className="flex flex-col gap-4">
      {!loggedIn && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={initialEmail}
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>

      {showForgot && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleForgot}
          className="w-full"
        >
          Forgot / Change Password
        </Button>
      )}

      <Link
        href="/login"
        className="text-center text-sm text-muted-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
