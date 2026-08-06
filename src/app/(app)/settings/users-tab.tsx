"use client";

import { useRef, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, LogIn, Pencil, Plus, Trash2 } from "lucide-react";

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { HelpTip } from "@/components/help-tip";
import { MultiSelect } from "@/components/multi-select";
import type { ManagedUser } from "@/lib/users-admin";
import { startImpersonation } from "../impersonate-actions";
import {
  changeUserPassword,
  createManagedUser,
  deleteManagedUser,
  revealUserPassword,
  updateManagedUser,
} from "./actions";

export type OrgOption = { id: string; name: string };

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

function AddUserDialog({
  role,
  organizations,
}: {
  role: "admin" | "manager";
  organizations: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<"manager" | "member">("member");
  const [organizationIds, setOrganizationIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setPassword("");
    setFullName("");
    setNewRole("member");
    setOrganizationIds([]);
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    if (!email || !password || !fullName) {
      setError("Name, email and password are all required.");
      return;
    }
    // A user in no organization can't be staffed onto anything and won't
    // appear in any picker, so say that up front rather than letting it be
    // discovered later.
    if (role === "admin" && organizationIds.length === 0) {
      setError(
        "Pick at least one organization — a user outside every organization can't be assigned to projects.",
      );
      return;
    }
    startTransition(async () => {
      const result = await createManagedUser({
        email,
        password,
        fullName,
        role: role === "manager" ? "member" : newRole,
        organizationIds,
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
            <>
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

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  Organizations
                  <HelpTip topic="organizations">
                    Which companies this person belongs to. It decides who can see them when
                    staffing a project — you can change it later from Edit.
                  </HelpTip>
                </Label>
                <MultiSelect
                  options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                  selected={organizationIds}
                  onChange={setOrganizationIds}
                  placeholder="Select one or more organizations"
                />
              </div>
            </>
          )}
          {role === "manager" && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              New users you create join <strong>your organizations</strong> automatically, and are
              always Members.
            </p>
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

/**
 * Edit an existing account.
 *
 * The Admin sees every field. A Manager gets the name only — the dialog is
 * the same component, just narrower, so there's one place to change rather
 * than two forms drifting apart. The server enforces the same split, so a
 * hand-crafted request doesn't get further than the UI does.
 */
function EditUserDialog({
  user,
  actorRole,
  organizations,
}: {
  user: ManagedUser;
  actorRole: "admin" | "manager";
  organizations: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [organizationIds, setOrganizationIds] = useState<string[]>(user.organization_ids);
  const [password, setPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const avatarRef = useRef<HTMLInputElement>(null);

  const isAdmin = actorRole === "admin";

  function handleSubmit() {
    setError(null);
    if (!fullName.trim()) {
      setError("Name is required.");
      return;
    }
    if (isAdmin && password && password.length < 8) {
      setError("A new password needs to be at least 8 characters.");
      return;
    }

    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("fullName", fullName);
    if (isAdmin) {
      formData.set("email", email);
      formData.set("role", role);
      if (password) formData.set("password", password);
      // The flag, not the ids, is what tells the server to sync — clearing
      // every organization submits no ids at all.
      formData.set("syncOrganizations", "1");
      for (const id of organizationIds) formData.append("organizationIds", id);
    }
    const file = avatarRef.current?.files?.[0];
    if (file) formData.set("avatar", file);

    startTransition(async () => {
      const result = await updateManagedUser(formData);
      if (result?.error) setError(result.error);
      else {
        setOpen(false);
        window.location.reload();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Edit ${user.full_name ?? "user"}`}
          />
        }
      >
        <Pencil className="size-3.5" />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.full_name || "user"}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {avatarPreview && <AvatarImage src={avatarPreview} />}
              <AvatarFallback className="bg-primary/10 text-primary">
                {(user.full_name ?? "?")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("") || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Profile picture</Label>
              <Input
                ref={avatarRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="max-w-52 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAvatarPreview(URL.createObjectURL(file));
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          {isAdmin && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  Email (their username)
                  <HelpTip topic="users">
                    Changing this changes what they sign in with. Tell them before you do.
                  </HelpTip>
                </Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  Role
                  <HelpTip topic="roles">
                    Manager: sees their organizations&apos; people and the projects they&apos;re
                    assigned to. Member: only the projects they&apos;re put on.
                  </HelpTip>
                </Label>
                <Select value={role} onValueChange={(v) => setRole((v ?? role) as typeof role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  Organizations
                  <HelpTip topic="organizations">
                    Which companies this person belongs to. Removing them from all of them makes
                    them invisible in every staffing picker.
                  </HelpTip>
                </Label>
                <MultiSelect
                  options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                  selected={organizationIds}
                  onChange={setOrganizationIds}
                  placeholder="Not in any organization"
                />
                {organizationIds.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    With no organization they can&apos;t be assigned to any project.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>New password (optional)</Label>
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep the current one"
                />
              </div>
            </>
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
            Save changes
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

function SwitchToButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startImpersonation(userId);
      if (result && "error" in result) setError(result.error ?? "Could not switch.");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
        title="View their dashboard, projects, and tasks as them"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
        Switch to
      </button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export function UsersTab({
  role,
  currentUserId,
  users,
  organizations,
}: {
  role: "admin" | "manager";
  currentUserId: string;
  users: ManagedUser[];
  organizations: OrgOption[];
}) {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex max-w-2xl items-start gap-1.5 text-sm text-muted-foreground">
          {role === "admin" ? (
            <span>Everyone in the workspace, across every organization.</span>
          ) : (
            <span>
              Everyone in your organizations. You can reset and switch into the{" "}
              <strong>members</strong> among them; fellow managers are listed so you can assign
              them to projects, but their accounts are not yours to touch.
            </span>
          )}
          <HelpTip topic="roles">
            Three roles: Admin (everything), Manager (their organizations&apos; people and their
            assigned projects), Member (only the projects they&apos;re put on).
          </HelpTip>
        </p>
        <AddUserDialog role={role} organizations={organizations} />
      </div>

      {/* Mobile: one card per person. The 7-column table needs 760px, which is
          twice a phone's width — scrolled sideways it's unreadable. */}
      <div className="flex flex-col gap-3 md:hidden">
        {list.map((user) => {
          const isSelf = user.id === currentUserId;

          return (
            <div key={user.id} className="flex flex-col gap-2.5 rounded-2xl border p-3.5">
              <div className="flex items-start gap-2.5">
                <Avatar className="size-9 shrink-0">
                  {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                  <AvatarFallback className="text-[11px]">
                    {(user.full_name ?? "?")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("") || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {user.full_name || "Unnamed"}
                    {isSelf && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>

              {user.organizations.length === 0 ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  In no organization — can&apos;t be staffed
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {user.organizations.map((org) => (
                    <Badge
                      key={org}
                      variant="secondary"
                      className="rounded-full border-none text-[10px] font-normal"
                    >
                      {org}
                    </Badge>
                  ))}
                </div>
              )}

              {role === "admin" && !isSelf && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
                  <PasswordCell userId={user.id} />
                  <ChangePasswordDialog userId={user.id} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 border-t pt-2.5">
                {user.switchable && <SwitchToButton userId={user.id} />}
                {(user.manageable || isSelf) && (
                  <EditUserDialog user={user} actorRole={role} organizations={organizations} />
                )}
                {user.manageable && !isSelf && (
                  <span className="ml-auto">
                    <DeleteUserDialog user={user} onConfirm={() => handleDelete(user)} />
                  </span>
                )}
                {!user.manageable && !isSelf && !user.switchable && (
                  <span className="text-[11px] text-muted-foreground">Read-only</span>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {role === "manager"
              ? "Nobody in your organizations yet. Ask the Admin to add you to one, or create a user above."
              : "No users yet."}
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Organizations</th>
              {role === "admin" && <th className="px-4 py-2 font-medium">Password</th>}
              <th className="px-4 py-2 font-medium">Switch</th>
              <th className="w-28 px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((user) => {
              const isSelf = user.id === currentUserId;

              return (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar className="size-7 shrink-0">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                        <AvatarFallback className="text-[10px]">
                          {(user.full_name ?? "?")
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("") || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {user.full_name || "Unnamed"}
                        {isSelf && (
                          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-2.5">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-2.5">
                    {user.organizations.length === 0 ? (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        None — can&apos;t be staffed
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {user.organizations.map((org) => (
                          <Badge
                            key={org}
                            variant="secondary"
                            className="rounded-full border-none text-[10px] font-normal"
                          >
                            {org}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  {role === "admin" && (
                    <td className="px-4 py-2.5">
                      {!isSelf && (
                        <div className="flex items-center gap-2">
                          <PasswordCell userId={user.id} />
                          <ChangePasswordDialog userId={user.id} />
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    {user.switchable ? (
                      <SwitchToButton userId={user.id} />
                    ) : (
                      !isSelf && (
                        <span className="text-[11px] text-muted-foreground">Not allowed</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center justify-end gap-3">
                      {(user.manageable || isSelf) && (
                        <EditUserDialog
                          user={user}
                          actorRole={role}
                          organizations={organizations}
                        />
                      )}
                      {user.manageable && !isSelf && (
                        <DeleteUserDialog user={user} onConfirm={() => handleDelete(user)} />
                      )}
                      {!user.manageable && !isSelf && (
                        <span className="text-[11px] text-muted-foreground">Read-only</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  {role === "manager"
                    ? "Nobody in your organizations yet. Ask the Admin to add you to one, or create a user above."
                    : "No users yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
