"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import type { ManagedUser } from "@/lib/users-admin";
import {
  changeUserPassword,
  createManagedUser,
  deleteManagedUser,
  revealUserPassword,
} from "./actions";

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    manager: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    member: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  };
  return (
    <Badge variant="secondary" className={`${styles[role]} rounded-full border-none`}>
      {role}
    </Badge>
  );
}

function AddUserDialog({ role }: { role: "admin" | "manager" }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<"manager" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setPassword("");
    setFullName("");
    setNewRole("member");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    if (!email || !password || !fullName) {
      setError("All fields are required.");
      return;
    }
    startTransition(async () => {
      const result = await createManagedUser({
        email,
        password,
        fullName,
        role: role === "manager" ? "member" : newRole,
      });
      if ("error" in result) setError(result.error ?? "Could not create user.");
      else {
        reset();
        setOpen(false);
        window.location.reload();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-3.5" />
        Add user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email (this is their username)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Initial password</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {role === "admin" && (
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordCell({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (visible) {
      setVisible(false);
      return;
    }
    startTransition(async () => {
      const result = await revealUserPassword(userId);
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

function ChangePasswordDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const result = await changeUserPassword(userId, password);
      if (result?.error) setError(result.error);
      else {
        setOpen(false);
        setPassword("");
        setError(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Change password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onConfirm,
}: {
  user: ManagedUser;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<button className="text-muted-foreground hover:text-destructive" />}
      >
        <Trash2 className="size-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.full_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes their account and access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UsersTab({ role, users }: { role: "admin" | "manager"; users: ManagedUser[] }) {
  const [, startTransition] = useTransition();
  const [list, setList] = useState(users);

  function handleDelete(user: ManagedUser) {
    setList((prev) => prev.filter((u) => u.id !== user.id));
    startTransition(() => {
      deleteManagedUser(user.id, user.role);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddUserDialog role={role} />
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              {role === "admin" && <th className="px-4 py-2 font-medium">Password</th>}
              <th className="w-10 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((user) => (
              <tr key={user.id} className="border-t">
                <td className="px-4 py-2.5 font-medium">{user.full_name || "Unnamed"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-2.5">
                  <RoleBadge role={user.role} />
                </td>
                {role === "admin" && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <PasswordCell userId={user.id} />
                      <ChangePasswordDialog userId={user.id} />
                    </div>
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <DeleteUserDialog user={user} onConfirm={() => handleDelete(user)} />
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
