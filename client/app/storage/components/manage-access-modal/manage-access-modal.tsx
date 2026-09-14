"use client";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { GitFork, Globe, ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  useAccessPolicies,
  useDmsDirectory,
  useGrantAccess,
  useIamOrganizations,
  useIamRoles,
  useIamUsers,
  useRevokeAccess,
  useToggleInheritance,
  useUpdateDmsDirectory,
} from "../../hooks/use-dms";
import { useGetFile, useUpdateFileAdditionalInfo } from "../../hooks/use-storage-file";
import {
  ObjectEffect,
  ObjectPermission,
  ObjectPrincipalType,
  DmsItem,
} from "../../models/dms.model";
import { PrincipalPicker } from "../principal-picker/principal-picker";

const PRINCIPAL_TYPES: ObjectPrincipalType[] = ["User", "Role", "Organization", "Everyone"];
const PERMISSIONS: ObjectPermission[] = ["View", "Download", "Edit", "Delete", "Manage", "Owner"];
const EFFECTS: ObjectEffect[] = ["Allow", "Deny"];
const GLOBAL_ROLE_SCOPE = "__all_organizations__";

const GENERAL_ACCESS_OPTIONS = [
  { value: "", label: "Default (unrestricted until shared)" },
  { value: "Creator", label: "Creator only, until shared" },
  { value: "Organization", label: "Anyone in my organization" },
] as const;

export interface ManageAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DmsItem;
}

/**
 * Who may do what with one directory or file.
 *
 * Two rules from the access model are visible here rather than left to a failed
 * request. An inherited entry cannot be revoked from the resource it is
 * inherited onto, so those rows show where they came from and offer no revoke.
 * And inheritance cannot be switched off while nothing else grants access, since
 * the resource would become invisible to everyone including the person doing it,
 * so that switch is disabled until the resource carries an entry of its own.
 *
 * Principals are picked from IAM (users / roles / organizations) instead of
 * being typed as opaque ids, and several can be granted at once — each picked
 * principal becomes its own access policy on submit.
 */
export function ManageAccessModal({ open, onOpenChange, item }: Readonly<ManageAccessModalProps>) {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const policies = useAccessPolicies(open ? item.itemId : undefined);
  const grant = useGrantAccess(item.itemId);
  const revoke = useRevokeAccess(item.itemId);
  const toggleInheritance = useToggleInheritance(item.itemId);

  const [principalType, setPrincipalType] = useState<ObjectPrincipalType>("User");
  const [permission, setPermission] = useState<ObjectPermission>("View");
  const [effect, setEffect] = useState<ObjectEffect>("Allow");
  const [selectedPrincipals, setSelectedPrincipals] = useState<string[]>([]);
  const [roleOrganizationId, setRoleOrganizationId] = useState(GLOBAL_ROLE_SCOPE);

  // General access: the default this item grants when nothing above has been
  // explicitly added yet. Read from whichever detail endpoint matches the item
  // kind, and kept in its own piece of state since the Select is edited before
  // it's saved.
  const directoryDetail = useDmsDirectory(item.type === "directory" ? item.itemId : undefined);
  const fileDetail = useGetFile(
    { itemId: item.itemId, projectKey },
    { enabled: open && item.type === "file" && !!projectKey },
  );
  const currentAccessLevel =
    item.type === "directory"
      ? (directoryDetail.data?.objectAccessLevel ?? "")
      : (fileDetail.data?.objectAccessLevel ?? "");
  const isLoadingAccessLevel =
    item.type === "directory" ? directoryDetail.isLoading : fileDetail.isLoading;

  // Tracks only what the user has actively picked, keyed by item so switching to a
  // different item (or reopening before a fetch resolves) falls back to the fetched
  // value instead of carrying over a stale pick — no effect needed to keep this in sync.
  const [override, setOverride] = useState<{ itemId: string; value: string } | null>(null);
  const generalAccess =
    override?.itemId === item.itemId ? override.value : currentAccessLevel;
  const setGeneralAccess = (value: string) => setOverride({ itemId: item.itemId, value });

  const updateDirectory = useUpdateDmsDirectory();
  const updateFile = useUpdateFileAdditionalInfo();
  const isSavingGeneralAccess = updateDirectory.isPending || updateFile.isPending;

  const handleSaveGeneralAccess = async () => {
    try {
      if (item.type === "directory") {
        await updateDirectory.mutateAsync({
          directoryId: item.itemId,
          objectAccessLevel: generalAccess,
          updateObjectAccessLevel: true,
        });
      } else {
        await updateFile.mutateAsync({
          itemId: item.itemId,
          projectKey,
          additionalProperties: {},
          objectAccessLevel: generalAccess,
          updateObjectAccessLevel: true,
        });
      }
      showSuccessToast({
        title: "General access updated",
        description:
          GENERAL_ACCESS_OPTIONS.find((o) => o.value === generalAccess)?.label ?? "Updated.",
      });
    } catch {
      showErrorToast({
        title: "Could not update general access",
        errors: "The change was not saved.",
      });
    }
  };

  const rows = policies.data ?? [];
  const ownEntries = rows.filter((p) => !p.isInherited);
  const needsPrincipal = principalType !== "Everyone";
  const canSubmit = !needsPrincipal || selectedPrincipals.length > 0;

  // Reset the selection whenever the principal type changes — a user id and a
  // role slug are not interchangeable, so carrying one over to the next list
  // would create invalid grants. Done in the change handler (rather than an
  // effect) to avoid cascading renders.
  const handlePrincipalTypeChange = (next: ObjectPrincipalType) => {
    setPrincipalType(next);
    setSelectedPrincipals([]);
    setRoleOrganizationId(GLOBAL_ROLE_SCOPE);
    setSearch("");
  };

  // The IAM search hooks are wired unconditionally so their cache keys are
  // stable; each one stays dormant (`enabled: false`) until the matching
  // principal type is selected, and only re-queries when the user has typed.
  const [search, setSearch] = useState("");
  const users = useIamUsers(search, open && principalType === "User");
  const roles = useIamRoles(search, open && principalType === "Role");
  const organizations = useIamOrganizations(
    principalType === "Organization" ? search : "",
    open && (principalType === "Organization" || principalType === "Role"),
  );

  const options =
    principalType === "User"
      ? (users.data ?? [])
      : principalType === "Role"
        ? (roles.data ?? [])
        : principalType === "Organization"
          ? (organizations.data ?? [])
          : [];

  const isLoading =
    principalType === "User"
      ? users.isLoading
      : principalType === "Role"
        ? roles.isLoading
        : principalType === "Organization"
          ? organizations.isLoading
          : false;

  const resourceType = item.type === "directory" ? "Directory" : "File";

  const handleGrant = async () => {
    // Everyone has no id; everything else fans out to one grant per picked id
    // so a single click can share with several users at once.
    const targets = needsPrincipal ? selectedPrincipals : [undefined];

    try {
      await Promise.all(
        targets.map((principalId) =>
          grant.mutateAsync({
            resourceId: item.itemId,
            resourceType,
            principalType,
            principalId,
            organizationId:
              principalType === "Role"
                ? roleOrganizationId === GLOBAL_ROLE_SCOPE
                  ? "default"
                  : roleOrganizationId
                : undefined,
            permission,
            effect,
          }),
        ),
      );
      const count = targets.length;
      showSuccessToast({
        title: "Access granted",
        description:
          count === 1
            ? `${permission} on ${item.name}.`
            : `${permission} on ${item.name} for ${count} principals.`,
      });
      setSelectedPrincipals([]);
      setSearch("");
    } catch {
      showErrorToast({
        title: "Could not grant access",
        errors: "The entry was not saved.",
      });
    }
  };

  const handleRevoke = async (policyItemId: string) => {
    try {
      await revoke.mutateAsync(policyItemId);
      showSuccessToast({ title: "Access revoked", description: "The entry was removed." });
    } catch {
      showErrorToast({ title: "Could not revoke", errors: "The entry was not removed." });
    }
  };

  const handleToggleInheritance = async () => {
    const next = !item.inheritsParentAccess;
    try {
      await toggleInheritance.mutateAsync(next);
      showSuccessToast({
        title: next ? "Inheritance on" : "Inheritance off",
        description: next
          ? "This item now follows its parent."
          : "This item now uses only its own entries.",
      });
    } catch {
      showErrorToast({
        title: "Could not change inheritance",
        errors: "Grant access on this item before switching inheritance off.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>Manage access</DialogTitle>
              <DialogDescription className="line-clamp-1">
                Control who can access{" "}
                <span className="font-medium text-foreground">{item.name}</span> and what they can
                do.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <section className="space-y-3 border-b bg-muted/10 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">General access</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The default this item grants before anything below is added. An explicit rule
                for a person, role, or organization always overrides this.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="General access"
              className="inline-flex overflow-hidden rounded-sm border border-input"
            >
              {GENERAL_ACCESS_OPTIONS.map((o) => {
                const active = generalAccess === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setGeneralAccess(o.value)}
                    disabled={isLoadingAccessLevel || isSavingGeneralAccess}
                    className={cn(
                      "border-r border-input px-3 py-1.5 text-sm font-medium transition-colors last:border-r-0 focus:relative focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveGeneralAccess}
              disabled={
                isLoadingAccessLevel ||
                isSavingGeneralAccess ||
                generalAccess === currentAccessLevel
              }
            >
              {isSavingGeneralAccess ? "Saving..." : "Save"}
            </Button>
          </div>
        </section>

        <div className="grid max-h-[calc(100vh-12rem)] overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5 border-b p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Add access</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a rule for a person, role, organization, or everyone.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Who should have access?</label>
              <div className="flex flex-wrap gap-2">
                {PRINCIPAL_TYPES.map((t) => {
                  const active = principalType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handlePrincipalTypeChange(t)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      aria-pressed={active}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {needsPrincipal ? (
              <div className="space-y-4">
                <PrincipalPicker
                  label={`Select ${principalType.toLowerCase()}${principalType === "Organization" ? "s" : ""}`}
                  options={options}
                  selected={selectedPrincipals}
                  onChange={setSelectedPrincipals}
                  isLoading={isLoading}
                  onSearchChange={setSearch}
                  hint="You can select more than one. Each selection becomes its own rule."
                />
                {principalType === "Role" ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="role-organization-scope">
                      Role scope
                    </label>
                    <Select value={roleOrganizationId} onValueChange={setRoleOrganizationId}>
                      <SelectTrigger id="role-organization-scope" aria-label="Role scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GLOBAL_ROLE_SCOPE}>All organizations</SelectItem>
                        {(organizations.data ?? []).map((organization) => (
                          <SelectItem key={organization.value} value={organization.value}>
                            {organization.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      Choose an organization to grant the role only within that organization.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                Everyone matches any authenticated caller. No selection is needed.
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Permission</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">What can they do?</span>
                  <Select
                    value={permission}
                    onValueChange={(v) => setPermission(v as ObjectPermission)}
                  >
                    <SelectTrigger id="permission" aria-label="Permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    Should this rule allow or deny?
                  </span>
                  <Select value={effect} onValueChange={(v) => setEffect(v as ObjectEffect)}>
                    <SelectTrigger id="effect" aria-label="Effect">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFECTS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Rule preview</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {needsPrincipal && selectedPrincipals.length > 0 ? (
                  options
                    .filter((o) => selectedPrincipals.includes(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="secondary">
                        {o.label}
                      </Badge>
                    ))
                ) : (
                  <span className="text-muted-foreground">
                    {needsPrincipal
                      ? `Choose ${principalType.toLowerCase()}s to continue.`
                      : "Everyone"}
                  </span>
                )}
                <Badge variant={effect === "Allow" ? "success" : "error"}>{effect}</Badge>
                <Badge variant="outline">{permission}</Badge>
              </div>
            </div>

            <Button
              onClick={handleGrant}
              disabled={!canSubmit || grant.isPending}
              className="w-full sm:w-auto"
            >
              {grant.isPending ? "Saving rule..." : "Add access rule"}
            </Button>
          </section>

          <section className="space-y-5 bg-muted/10 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Access rules</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rules directly on this item and those inherited from its parent.
                </p>
              </div>
              {!policies.isLoading ? <Badge variant="secondary">{rows.length}</Badge> : null}
            </div>

            {policies.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                No rules on this item. Access comes from the parent directory.
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((policy) => (
                  <li key={policy.itemId} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {policy.principalId ?? "Everyone"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {policy.principalType}
                          {policy.organizationId ? ` · Organization ${policy.organizationId}` : ""}
                          {policy.isInherited ? " · Inherited from parent" : " · Direct rule"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge variant={policy.effect === "Allow" ? "success" : "error"}>
                          {policy.effect}
                        </Badge>
                        <Badge variant="outline">{policy.permission}</Badge>
                      </div>
                    </div>
                    {!policy.isInherited ? (
                      <Button
                        variant="destructive-outline"
                        size="xs"
                        className="mt-3"
                        onClick={() => handleRevoke(policy.itemId)}
                        disabled={revoke.isPending}
                      >
                        Remove rule
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-lg border bg-background p-4">
              <div className="flex gap-3">
                <GitFork
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Inheritance</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.inheritsParentAccess
                      ? "This item follows rules from its parent directory."
                      : "This item uses only its direct rules."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={handleToggleInheritance}
                disabled={
                  toggleInheritance.isPending ||
                  (item.inheritsParentAccess && ownEntries.length === 0)
                }
              >
                {toggleInheritance.isPending
                  ? "Updating..."
                  : item.inheritsParentAccess
                    ? "Turn off inheritance"
                    : "Turn on inheritance"}
              </Button>
              {item.inheritsParentAccess && ownEntries.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add a direct allow rule before turning inheritance off.
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
