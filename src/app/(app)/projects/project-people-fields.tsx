"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Folder } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { MultiSelect, type MultiSelectOption } from "@/components/multi-select";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssignablePerson } from "@/lib/projects";

export type OrgOption = { id: string; name: string };
export type FolderOption = { id: string; name: string; organization_id: string };

/**
 * The organization + managers + members block shared by the create and edit
 * project dialogs.
 *
 * The organization drives everything below it: pick a different one and the
 * two people pickers re-filter to that organization's roster, dropping anyone
 * who is no longer eligible. That's the rule the whole tenancy model rests on
 * — you can only staff a project with people from its organization.
 */
export function ProjectPeopleFields({
  organizations,
  people,
  canChooseOrganization,
  defaultOrganizationId,
  folders,
  defaultFolderId,
  managerIds,
  memberIds,
  onManagerIdsChange,
  onMemberIdsChange,
}: {
  organizations: OrgOption[];
  people: AssignablePerson[];
  canChooseOrganization: boolean;
  defaultOrganizationId?: string | null;
  /** Omit to leave the folder field out entirely — callers that predate
   *  folders (schema-v13) keep their current form. */
  folders?: FolderOption[];
  defaultFolderId?: string | null;
  managerIds: string[];
  memberIds: string[];
  onManagerIdsChange: (ids: string[]) => void;
  onMemberIdsChange: (ids: string[]) => void;
}) {
  const [orgId, setOrgId] = useState<string>(
    defaultOrganizationId ?? organizations[0]?.id ?? "",
  );
  const [folderChoice, setFolderChoice] = useState<string>(defaultFolderId ?? "");

  // Admins are deliberately exempt from the organization filter — they operate
  // across all of them, and need to be assignable to any project as a manager,
  // a member, or a task's assignee.
  const eligible = useMemo(
    () =>
      orgId
        ? people.filter((p) => p.role === "admin" || p.org_ids.includes(orgId))
        : people,
    [people, orgId],
  );

  // Switching organization must not leave behind someone from the previous
  // one — they'd be silently submitted and RLS would reject the write.
  useEffect(() => {
    const allowed = new Set(eligible.map((p) => p.id));
    const nextManagers = managerIds.filter((id) => allowed.has(id));
    const nextMembers = memberIds.filter((id) => allowed.has(id));
    if (nextManagers.length !== managerIds.length) onManagerIdsChange(nextManagers);
    if (nextMembers.length !== memberIds.length) onMemberIdsChange(nextMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, eligible]);

  const managerOptions: MultiSelectOption[] = eligible
    .filter((p) => p.role === "manager" || p.role === "admin")
    .map((p) => ({ value: p.id, label: p.full_name || "Unnamed user", hint: p.role }));

  const memberOptions: MultiSelectOption[] = eligible.map((p) => ({
    value: p.id,
    label: p.full_name || "Unnamed user",
    hint: p.role,
  }));

  // A folder belongs to one organization, so the list follows the picker above.
  const eligibleFolders = (folders ?? []).filter((f) => f.organization_id === orgId);

  // Derived rather than corrected in an effect: switching organization makes a
  // previously chosen folder invalid, and the answer is simply to stop using it
  // — storing the correction would mean a setState during render's effect for
  // something that can be computed outright.
  const folderId = eligibleFolders.some((f) => f.id === folderChoice)
    ? folderChoice
    : eligibleFolders[0]?.id ?? "";

  return (
    <>
      <input type="hidden" name="organizationId" value={orgId} />
      {folders && <input type="hidden" name="folderId" value={folderId} />}

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <Building2 className="size-3.5" />
          Organization
          <HelpTip topic="organizations">
            Which company this project belongs to. It decides who you can staff it with — only
            people in this organization appear in the pickers below, plus the Admin, who works
            across all of them.
          </HelpTip>
        </Label>
        {canChooseOrganization && organizations.length > 1 ? (
          <Select value={orgId} onValueChange={(v) => setOrgId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {organizations.find((o) => o.id === orgId)?.name ?? "No organization"}
          </p>
        )}
        {organizations.length === 0 && (
          <p className="text-xs text-destructive">
            You&apos;re not in an organization yet — ask the Admin to add you to one before
            creating projects.
          </p>
        )}
      </div>

      {folders && (
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5">
            <Folder className="size-3.5" />
            Folder
            <HelpTip topic="project-folders">
              The folder this project is filed under, inside the organization above. Folders are
              filing only — putting a project in one doesn&apos;t give anybody access to it.
            </HelpTip>
          </Label>
          {eligibleFolders.length > 0 ? (
            <Select value={folderId} onValueChange={(v) => setFolderChoice(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a folder" />
              </SelectTrigger>
              <SelectContent>
                {eligibleFolders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              This organization has no folders yet — the project will be created unfiled, and you
              can add a folder for it from the Projects page.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          Project managers
          <HelpTip topic="project-visibility">
            Fellow managers who run this project alongside you. They get full control of it, and
            it appears on their side the moment you add them here.
          </HelpTip>
        </Label>
        <MultiSelect
          options={managerOptions}
          selected={managerIds}
          onChange={onManagerIdsChange}
          placeholder={
            managerOptions.length > 0
              ? "Select one or more managers"
              : "No other managers in this organization"
          }
        />
        {managerIds.map((id) => (
          <input key={id} type="hidden" name="managerIds" value={id} />
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          Assigned members
          <HelpTip topic="project-visibility">
            The people who will actually work on this project. Until you add someone here, the
            project is visible to you alone.
          </HelpTip>
        </Label>
        <MultiSelect
          options={memberOptions}
          selected={memberIds}
          onChange={onMemberIdsChange}
          placeholder={
            memberOptions.length > 0
              ? "Select team members"
              : "Nobody in this organization yet"
          }
        />
        {memberIds.map((id) => (
          <input key={id} type="hidden" name="memberIds" value={id} />
        ))}
      </div>
    </>
  );
}
