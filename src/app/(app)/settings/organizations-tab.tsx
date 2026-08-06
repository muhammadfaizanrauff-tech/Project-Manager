"use client";

import { useRef, useState, useTransition } from "react";
import { Building2, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";

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
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/help-tip";
import { MultiSelect, type MultiSelectOption } from "@/components/multi-select";
import { SettingsSection } from "./settings-section";
import type { OrganizationDetail } from "@/lib/organizations";
import {
  createOrganization,
  deleteOrganization,
  setOrganizationMembers,
  updateOrganization,
} from "./organization-actions";

type PersonOption = { id: string; full_name: string | null; role: string };

function OrgFormDialog({
  trigger,
  title,
  initial,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: { id?: string; name: string; description: string; logoUrl: string | null };
  onSubmit: (formData: FormData) => Promise<{ error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // null = show the existing logo (or the placeholder); a string = a freshly
  // picked file being previewed; "" = the user explicitly cleared it.
  const [logoPreview, setLogoPreview] = useState<string | null>(initial?.logoUrl ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Give the organization a name.");
      return;
    }

    // FormData rather than a plain object: a File can't cross the Server
    // Action boundary any other way.
    const formData = new FormData();
    if (initial?.id) formData.set("id", initial.id);
    formData.set("name", name);
    formData.set("description", description);
    if (removeLogo) formData.set("removeLogo", "1");
    const file = fileRef.current?.files?.[0];
    if (file) formData.set("logo", file);

    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <Avatar className="size-16 rounded-xl" size="lg">
              {logoPreview && !removeLogo && (
                <AvatarImage src={logoPreview} className="rounded-xl object-contain" />
              )}
              <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="flex items-center gap-1.5">
                Organization logo
                <HelpTip topic="organizations">
                  Shown on the organization card and beside every project filed under it. PNG,
                  JPEG, WebP or SVG, up to 2 MB.
                </HelpTip>
              </Label>
              <Input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="max-w-56 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setLogoPreview(URL.createObjectURL(file));
                    setRemoveLogo(false);
                  }
                }}
              />
              {initial?.logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveLogo((v) => !v);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  {removeLogo ? "Keep the current logo" : "Remove logo"}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Organization name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Genius Food Purchasing"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this company or business unit covers."
            />
          </div>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageMembersDialog({
  org,
  people,
}: {
  org: OrganizationDetail;
  people: PersonOption[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(org.members.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options: MultiSelectOption[] = people
    .filter((p) => p.role !== "admin")
    .map((p) => ({
      value: p.id,
      label: p.full_name || "Unnamed user",
      hint: p.role,
    }));

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setOrganizationMembers(org.id, selected);
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
          <Button variant="outline" size="sm" className="gap-1.5">
            <Users className="size-3.5" />
            People
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who belongs to {org.name}?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Managers in this organization can see these people when staffing projects, and can
            switch into the member accounts among them. Being here does <strong>not</strong> give
            anyone sight of the organization&apos;s projects — that still takes a project
            assignment.
          </p>
          <MultiSelect
            options={options}
            selected={selected}
            onChange={setSelected}
            placeholder="Add managers and members"
          />
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOrgDialog({ org }: { org: OrganizationDetail }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label={`Delete ${org.name}`}
          />
        }
      >
        <Trash2 className="size-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its {org.project_count} project{org.project_count === 1 ? "" : "s"} will survive but
            become unassigned, and only you will be able to see them until they&apos;re moved into
            another organization. The user accounts themselves are not deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteOrganization(org.id);
                window.location.reload();
              })
            }
          >
            Delete organization
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OrganizationsTab({
  organizations,
  people,
}: {
  organizations: OrganizationDetail[];
  people: PersonOption[];
}) {
  return (
    <SettingsSection
      title="Organizations"
      width="wide"
      description={
        <>
          An organization is one of the companies you run. It decides{" "}
          <strong>who can see whom</strong>: a Manager placed in an organization sees that
          organization&apos;s people when staffing a project, and nobody outside it. Projects live
          inside an organization.
          <HelpTip topic="organizations" className="ml-1 align-text-bottom">
            Organizations are the top of the hierarchy: Organization → Projects → Categories →
            Tasks. Only you (the Admin) can create them or change who&apos;s in them.
          </HelpTip>
        </>
      }
      action={
        <OrgFormDialog
          title="Create an organization"
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              New organization
            </Button>
          }
          onSubmit={async (formData) => {
            const result = await createOrganization(formData);
            if (!result?.error) window.location.reload();
            return result ?? {};
          }}
        />
      }
    >

      {organizations.length === 0 && (
        <Card className="flex flex-col items-center gap-2 rounded-2xl border-dashed py-12 text-center">
          <Building2 className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No organizations yet. Create one per company you work with.
          </p>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {organizations.map((org) => (
          <Card key={org.id} className="gap-3 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="size-10 shrink-0 rounded-xl" size="lg">
                  {org.logo_url && (
                    <AvatarImage src={org.logo_url} className="rounded-xl object-contain" />
                  )}
                  <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                    <Building2 className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                <h3 className="truncate font-semibold">{org.name}</h3>
                {org.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {org.description}
                  </p>
                )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <OrgFormDialog
                  title={`Edit ${org.name}`}
                  initial={{
                    id: org.id,
                    name: org.name,
                    description: org.description ?? "",
                    logoUrl: org.logo_url,
                  }}
                  trigger={
                    <button
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Edit ${org.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  }
                  onSubmit={async (formData) => {
                    const result = await updateOrganization(formData);
                    if (!result?.error) window.location.reload();
                    return result ?? {};
                  }}
                />
                <DeleteOrgDialog org={org} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {org.project_count} project{org.project_count === 1 ? "" : "s"}
              </span>
              <span aria-hidden>·</span>
              <span>
                {org.members.length} {org.members.length === 1 ? "person" : "people"}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {org.members.length === 0 && (
                <span className="text-xs text-muted-foreground">Nobody added yet.</span>
              )}
              {org.members.slice(0, 12).map((m) => (
                <Badge
                  key={m.id}
                  variant="secondary"
                  className="rounded-full border-none font-normal"
                >
                  {m.full_name || "Unnamed"}
                  <span className="ml-1 text-[10px] opacity-60">{m.role}</span>
                </Badge>
              ))}
              {org.members.length > 12 && (
                <span className="self-center text-xs text-muted-foreground">
                  +{org.members.length - 12} more
                </span>
              )}
            </div>

            <div className="flex justify-end">
              <ManageMembersDialog org={org} people={people} />
            </div>
          </Card>
        ))}
      </div>
    </SettingsSection>
  );
}
