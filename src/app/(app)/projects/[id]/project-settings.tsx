"use client";

import { useActionState, useState, useTransition } from "react";
import { ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";

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
import { MultiSelect, type MultiSelectOption } from "@/components/multi-select";
import { deleteProject, updateProject, type UpdateProjectState } from "../actions";
import { requestProjectDeletion } from "./delete-request-actions";

type ProfileOption = { id: string; full_name: string | null; role: string };

const initialState: UpdateProjectState = {};

export function EditProjectDialog({
  project,
  profiles,
  canAssignPeople,
}: {
  project: {
    id: string;
    name: string;
    logo_url: string | null;
    start_date: string;
    end_date: string | null;
    managers: { id: string; full_name: string | null }[];
    members: { id: string; full_name: string | null; role: string }[];
  };
  profiles: ProfileOption[];
  canAssignPeople: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(project.logo_url);
  const [memberIds, setMemberIds] = useState<string[]>(project.members.map((m) => m.id));
  const [managerIds, setManagerIds] = useState<string[]>(project.managers.map((m) => m.id));
  const [state, formAction, pending] = useActionState(updateProject, initialState);
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>();

  const managerOptions: MultiSelectOption[] = profiles
    .filter((p) => p.role === "admin" || p.role === "manager")
    .map((p) => ({
      value: p.id,
      label: p.full_name || "Unnamed user",
      hint: p.role,
    }));
  const memberOptions: MultiSelectOption[] = profiles.map((p) => ({
    value: p.id,
    label: p.full_name || "Unnamed user",
    hint: p.role,
  }));

  // Close once per successful save. Comparing timestamps (rather than a
  // boolean) means reopening the dialog later doesn't immediately re-close it,
  // and a second save still closes.
  if (state.savedAt && state.savedAt !== lastSavedAt) {
    setLastSavedAt(state.savedAt);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-3.5" />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={project.id} />

          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-xl" size="lg">
              {logoPreview && <AvatarImage src={logoPreview} className="rounded-xl" />}
              <AvatarFallback className="rounded-xl">
                <ImagePlus className="size-5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1.5">
              <Label>Project logo</Label>
              <Input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="max-w-56 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setLogoPreview(URL.createObjectURL(file));
                }}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the current one.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Project name</Label>
            <Input id="edit-name" name="name" defaultValue={project.name} required />
          </div>

          {canAssignPeople && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Project managers</Label>
                <MultiSelect
                  options={managerOptions}
                  selected={managerIds}
                  onChange={setManagerIds}
                  placeholder="Select one or more managers"
                />
                {managerIds.map((id) => (
                  <input key={id} type="hidden" name="managerIds" value={id} />
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Assigned members</Label>
                <MultiSelect
                  options={memberOptions}
                  selected={memberIds}
                  onChange={setMemberIds}
                  placeholder="Select team members"
                />
                {memberIds.map((id) => (
                  <input key={id} type="hidden" name="memberIds" value={id} />
                ))}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-startDate">Start date</Label>
              <Input
                id="edit-startDate"
                name="startDate"
                type="date"
                defaultValue={project.start_date}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-endDate">Tentative end date</Label>
              <Input
                id="edit-endDate"
                name="endDate"
                type="date"
                defaultValue={project.end_date ?? ""}
              />
            </div>
          </div>

          {state.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectButton({
  projectId,
  projectName,
  canDelete,
}: {
  projectId: string;
  projectName: string;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = canDelete
        ? await deleteProject(projectId)
        : await requestProjectDeletion(projectId, projectName);

      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!canDelete) setRequested(true);
    });
  }

  if (requested) {
    return (
      <span className="text-xs text-muted-foreground">Deletion requested</span>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-destructive">
            <Trash2 className="size-3.5" />
            {canDelete ? "Delete" : "Request delete"}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {canDelete ? `Delete ${projectName}?` : `Request deletion of ${projectName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {canDelete
              ? "This permanently removes the project and every task, category and comment in it. It can't be undone."
              : "An Admin reviews this in Settings. Nothing is deleted until they approve it."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* AlertDialogAction is a plain Button here, not a Close primitive,
              so the dialog stays open until handleConfirm closes it — errors
              stay visible. */}
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {canDelete ? "Delete project" : "Send request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
