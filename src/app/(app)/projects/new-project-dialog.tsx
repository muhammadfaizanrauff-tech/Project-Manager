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
import { MultiSelect, type MultiSelectOption } from "@/components/multi-select";
import { createProject, type CreateProjectState } from "./actions";

type ProfileOption = { id: string; full_name: string | null; role: string };

const initialState: CreateProjectState = {};

export function NewProjectDialog({
  profiles,
  canAssignPeople,
}: {
  profiles: ProfileOption[];
  canAssignPeople: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(createProject, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
