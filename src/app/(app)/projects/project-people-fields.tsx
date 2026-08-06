"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";

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
  managerIds,
  memberIds,
  onManagerIdsChange,
  onMemberIdsChange,
}: {
  organizations: OrgOption[];
  people: AssignablePerson[];
  canChooseOrganization: boolean;
  defaultOrganizationId?: string | null;
  managerIds: string[];
  memberIds: string[];
  onManagerIdsChange: (ids: string[]) => void;
  onMemberIdsChange: (ids: string[]) => void;
}) {
  const [orgId, setOrgId] = useState<string>(
    defaultOrganizationId ?? organizations[0]?.id ?? "",
  );

  const eligible = useMemo(
    () => (orgId ? people.filter((p) => p.org_ids.includes(orgId)) : people),
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
    .filter((p) => p.role === "manager")
    .map((p) => ({ value: p.id, label: p.full_name || "Unnamed user", hint: p.role }));

  const memberOptions: MultiSelectOption[] = eligible.map((p) => ({
    value: p.id,
    label: p.full_name || "Unnamed user",
    hint: p.role,
  }));

  return (
    <>
      <input type="hidden" name="organizationId" value={orgId} />

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <Building2 className="size-3.5" />
          Organization
          <HelpTip topic="organizations">
            Which company this project belongs to. It decides who you can staff it with — only
            people in this organization appear in the pickers below.
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
