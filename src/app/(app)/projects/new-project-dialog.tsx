"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { ImagePlus, Loader2, Plus } from "lucide-react";

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
import type { AssignablePerson } from "@/lib/projects";
import { createProject, type CreateProjectState } from "./actions";
import { ProjectPeopleFields, type OrgOption } from "./project-people-fields";

const initialState: CreateProjectState = {};

export function NewProjectDialog({
  people,
  organizations,
  canAssignPeople,
  isAdmin,
}: {
  people: AssignablePerson[];
  organizations: OrgOption[];
  canAssignPeople: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(createProject, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="rounded-full">
            <Plus className="size-4" />
            New Project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-xl" size="lg">
              {logoPreview && <AvatarImage src={logoPreview} className="rounded-xl" />}
              <AvatarFallback className="rounded-xl">
                <ImagePlus className="size-5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1.5">
              <Label>Project logo (optional)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="max-w-56 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setLogoPreview(URL.createObjectURL(file));
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" placeholder="Website Redesign" required />
          </div>

          {canAssignPeople && (
            <ProjectPeopleFields
              organizations={organizations}
              people={people}
              canChooseOrganization
              managerIds={managerIds}
              memberIds={memberIds}
              onManagerIdsChange={setManagerIds}
              onMemberIdsChange={setMemberIds}
            />
          )}

          {canAssignPeople && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              A new project is visible to <strong>you alone</strong> until you assign someone. Add
              members to let people work on it, or fellow managers to share control of it.
              {isAdmin && " As Admin you see every project regardless."}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Creation date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={today} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">Tentative end date</Label>
              <Input id="endDate" name="endDate" type="date" />
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
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
