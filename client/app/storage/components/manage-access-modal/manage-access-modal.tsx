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
import { useMemo, useState } from "react";
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
  AccessPolicyDto,
  ObjectEffect,
  ObjectPermission,
  ObjectPrincipalType,
  DmsItem,
} from "../../models/dms.model";
import { PrincipalSelector, usePrincipalSelection } from "../principal-selector/principal-selector";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_STORAGE_MODULE = "data.storage";
const EVERYONE_KEY = "MANAGE_ACCESS_MODAL.EVERYONE";
const PERMISSIONS: ObjectPermission[] = ["View", "Download", "Edit", "Delete", "Manage", "Owner"];
const EFFECTS: ObjectEffect[] = ["Allow", "Deny"];

const GENERAL_ACCESS_OPTIONS = [
  { value: "", get label() { return tStatic(DATA_STORAGE_MODULE, "MANAGE_ACCESS_MODAL.DEFAULT_UNRESTRICTED_UNTIL_SHARED"); } },
  { value: "Creator", get label() { return tStatic(DATA_STORAGE_MODULE, "MANAGE_ACCESS_MODAL.CREATOR_ONLY_UNTIL_SHARED"); } },
  { value: "Organization", get label() { return tStatic(DATA_STORAGE_MODULE, "MANAGE_ACCESS_MODAL.ANYONE_IN_MY_ORGANIZATION"); } },
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
  const { t: tx } = useT(DATA_STORAGE_MODULE);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const policies = useAccessPolicies(open ? item.itemId : undefined);
  const grant = useGrantAccess(item.itemId);
  const revoke = useRevokeAccess(item.itemId);
  const toggleInheritance = useToggleInheritance(item.itemId);

  const selection = usePrincipalSelection(open);
  const { principalType, selectedPrincipals, options, needsPrincipal } = selection;
  const [permission, setPermission] = useState<ObjectPermission>("View");
  const [effect, setEffect] = useState<ObjectEffect>("Allow");

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
        title: tx("MANAGE_ACCESS_MODAL.GENERAL_ACCESS_UPDATED"),
        description:
          GENERAL_ACCESS_OPTIONS.find((o) => o.value === generalAccess)?.label ?? tx("MANAGE_ACCESS_MODAL.UPDATED"),
      });
    } catch {
      showErrorToast({
        title: tx("MANAGE_ACCESS_MODAL.COULD_NOT_UPDATE_GENERAL_ACCESS"),
        errors: tx("MANAGE_ACCESS_MODAL.THE_CHANGE_WAS_NOT_SAVED"),
      });
    }
  };

  const rows = useMemo(() => policies.data ?? [], [policies.data]);
  const ownEntries = rows.filter((p) => !p.isInherited);
  const canSubmit = !needsPrincipal || selectedPrincipals.length > 0;

  // Access rules carry IAM ids, not names ("b41a3acb-..." rather than "Editor").
  // Resolve them for display: a plain, unfiltered lookup per principal type
  // actually present in the rows, cached separately from the Add-access
  // panel's own (search-filtered) picker queries. A page of 50 covers the
  // common case; an id outside that page still falls back to itself below
  // rather than the row silently going blank.
  const rowPrincipalTypes = useMemo(() => new Set(rows.map((p) => p.principalType)), [rows]);
  const rowsNeedOrganizationNames = useMemo(
    () => rowPrincipalTypes.has("Organization") || rows.some((p) => !!p.organizationId),
    [rowPrincipalTypes, rows],
  );
  const rowUsers = useIamUsers("", open && rowPrincipalTypes.has("User"));
  const rowRoles = useIamRoles("", open && rowPrincipalTypes.has("Role"));
  const rowOrganizations = useIamOrganizations("", open && rowsNeedOrganizationNames);

  const userNameById = useMemo(
    () => new Map((rowUsers.data ?? []).map((u) => [u.value, u.label])),
    [rowUsers.data],
  );
  const roleNameById = useMemo(
    () => new Map((rowRoles.data ?? []).map((r) => [r.value, r.label])),
    [rowRoles.data],
  );
  const organizationNameById = useMemo(
    () => new Map((rowOrganizations.data ?? []).map((o) => [o.value, o.label])),
    [rowOrganizations.data],
  );

  const principalNameById = (t: ObjectPrincipalType) => {
    if (t === "User") return userNameById;
    return t === "Role" ? roleNameById : organizationNameById;
  };

  // Enum values go to the API as they are; these are the words shown to the user.
  const enumLabels: Record<string, string> = {
    User: tx("MANAGE_ACCESS_MODAL.TYPE_USER"),
    Role: tx("MANAGE_ACCESS_MODAL.TYPE_ROLE"),
    Organization: tx("MANAGE_ACCESS_MODAL.TYPE_ORGANIZATION"),
    Everyone: tx(EVERYONE_KEY),
    View: tx("MANAGE_ACCESS_MODAL.PERMISSION_VIEW"),
    Download: tx("MANAGE_ACCESS_MODAL.PERMISSION_DOWNLOAD"),
    Edit: tx("MANAGE_ACCESS_MODAL.PERMISSION_EDIT"),
    Delete: tx("MANAGE_ACCESS_MODAL.PERMISSION_DELETE"),
    Manage: tx("MANAGE_ACCESS_MODAL.PERMISSION_MANAGE"),
    Owner: tx("MANAGE_ACCESS_MODAL.PERMISSION_OWNER"),
    Allow: tx("MANAGE_ACCESS_MODAL.EFFECT_ALLOW"),
    Deny: tx("MANAGE_ACCESS_MODAL.EFFECT_DENY"),
  };
  const labelOf = (value: string) => enumLabels[value] ?? value;

  const resolvePrincipalName = (policy: AccessPolicyDto): string => {
    if (!policy.principalId) return tx(EVERYONE_KEY);
    return principalNameById(policy.principalType).get(policy.principalId) ?? policy.principalId;
  };

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
            organizationId: selection.roleScopeOrganizationId,
            permission,
            effect,
          }),
        ),
      );
      const count = targets.length;
      showSuccessToast({
        title: tx("MANAGE_ACCESS_MODAL.ACCESS_GRANTED"),
        description:
          count === 1
            ? tx("MANAGE_ACCESS_MODAL.PERMISSION_ON_NAME", { permission, name: item.name })
            : tx("MANAGE_ACCESS_MODAL.PERMISSION_ON_NAME_FOR_COUNT", { permission, name: item.name, count }),
      });
      selection.clearPicks();
    } catch {
      showErrorToast({
        title: tx("MANAGE_ACCESS_MODAL.COULD_NOT_GRANT_ACCESS"),
        errors: tx("MANAGE_ACCESS_MODAL.THE_ENTRY_WAS_NOT_SAVED"),
      });
    }
  };

  const handleRevoke = async (policyItemId: string) => {
    try {
      await revoke.mutateAsync(policyItemId);
      showSuccessToast({ title: tx("MANAGE_ACCESS_MODAL.ACCESS_REVOKED"), description: tx("MANAGE_ACCESS_MODAL.THE_ENTRY_WAS_REMOVED") });
    } catch {
      showErrorToast({ title: tx("MANAGE_ACCESS_MODAL.COULD_NOT_REVOKE"), errors: tx("MANAGE_ACCESS_MODAL.THE_ENTRY_WAS_NOT_REMOVED") });
    }
  };

  const handleToggleInheritance = async () => {
    const next = !item.inheritsParentAccess;
    try {
      await toggleInheritance.mutateAsync(next);
      showSuccessToast({
        title: next ? tx("MANAGE_ACCESS_MODAL.INHERITANCE_ON") : tx("MANAGE_ACCESS_MODAL.INHERITANCE_OFF"),
        description: next
          ? tx("MANAGE_ACCESS_MODAL.THIS_ITEM_NOW_FOLLOWS_ITS_PARENT")
          : tx("MANAGE_ACCESS_MODAL.THIS_ITEM_NOW_USES_ONLY_ITS"),
      });
    } catch {
      showErrorToast({
        title: tx("MANAGE_ACCESS_MODAL.COULD_NOT_CHANGE_INHERITANCE"),
        errors: tx("MANAGE_ACCESS_MODAL.GRANT_ACCESS_ON_THIS_ITEM_BEFORE"),
      });
    }
  };

  const describeChoosePrincipals = (): string => {
    if (principalType === "Organization") return tx("MANAGE_ACCESS_MODAL.CHOOSE_ORGANIZATIONS_TO_CONTINUE");
    return principalType === "Role"
      ? tx("MANAGE_ACCESS_MODAL.CHOOSE_ROLES_TO_CONTINUE")
      : tx("MANAGE_ACCESS_MODAL.CHOOSE_USERS_TO_CONTINUE");
  };
  const choosePrincipalsLabel = describeChoosePrincipals();
  const inheritanceToggleLabel = item.inheritsParentAccess
    ? tx("MANAGE_ACCESS_MODAL.TURN_OFF_INHERITANCE")
    : tx("MANAGE_ACCESS_MODAL.TURN_ON_INHERITANCE");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{tx("MANAGE_ACCESS_MODAL.MANAGE_ACCESS")}</DialogTitle>
              <DialogDescription className="line-clamp-1">
                {tx("MANAGE_ACCESS_MODAL.CONTROL_WHO_CAN_ACCESS")}
                <span className="font-medium text-foreground">{item.name}</span> {tx("MANAGE_ACCESS_MODAL.AND_WHAT_THEY_CAN_DO")}
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
              <h3 className="text-sm font-semibold">{tx("MANAGE_ACCESS_MODAL.GENERAL_ACCESS")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {tx("MANAGE_ACCESS_MODAL.THE_DEFAULT_THIS_ITEM_GRANTS_BEFORE")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <fieldset
              aria-label={tx("MANAGE_ACCESS_MODAL.GENERAL_ACCESS")}
              className="m-0 min-w-0 inline-flex overflow-hidden rounded-sm border border-input"
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
                      "border-r border-input px-3 py-1.5 text-sm font-medium transition-colors last:border-r-0 focus:relative focus:outline-hidden focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
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
            </fieldset>
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
              {isSavingGeneralAccess ? tx("MANAGE_ACCESS_MODAL.SAVING") : tx("common:SAVE")}
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
                <h3 className="text-sm font-semibold">{tx("MANAGE_ACCESS_MODAL.ADD_ACCESS")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tx("MANAGE_ACCESS_MODAL.CREATE_A_RULE_FOR_A_PERSON")}
                </p>
              </div>
            </div>

            <PrincipalSelector
              selection={selection}
              hint={tx("MANAGE_ACCESS_MODAL.YOU_CAN_SELECT_MORE_THAN_ONE")}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">{tx("MANAGE_ACCESS_MODAL.PERMISSION")}</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">{tx("MANAGE_ACCESS_MODAL.WHAT_CAN_THEY_DO")}</span>
                  <Select
                    value={permission}
                    onValueChange={(v) => setPermission(v as ObjectPermission)}
                  >
                    <SelectTrigger id="permission" aria-label={tx("MANAGE_ACCESS_MODAL.PERMISSION")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {labelOf(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    {tx("MANAGE_ACCESS_MODAL.SHOULD_THIS_RULE_ALLOW_OR_DENY")}
                  </span>
                  <Select value={effect} onValueChange={(v) => setEffect(v as ObjectEffect)}>
                    <SelectTrigger id="effect" aria-label={tx("MANAGE_ACCESS_MODAL.EFFECT")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFECTS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {labelOf(e)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{tx("MANAGE_ACCESS_MODAL.RULE_PREVIEW")}</p>
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
                      ? choosePrincipalsLabel
                      : tx(EVERYONE_KEY)}
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
              {grant.isPending ? tx("MANAGE_ACCESS_MODAL.SAVING_RULE") : tx("MANAGE_ACCESS_MODAL.ADD_ACCESS_RULE")}
            </Button>
          </section>

          <section className="space-y-5 bg-muted/10 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{tx("MANAGE_ACCESS_MODAL.ACCESS_RULES")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tx("MANAGE_ACCESS_MODAL.RULES_DIRECTLY_ON_THIS_ITEM_AND")}
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
                {tx("MANAGE_ACCESS_MODAL.NO_RULES_ON_THIS_ITEM_ACCESS")}
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((policy) => (
                  <li key={policy.itemId} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          title={policy.principalId ?? undefined}
                        >
                          {resolvePrincipalName(policy)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {labelOf(policy.principalType)}
                          {policy.organizationId
                            ? tx("MANAGE_ACCESS_MODAL.IN_ORGANIZATION", {
                                name: organizationNameById.get(policy.organizationId) ?? policy.organizationId,
                              })
                            : ""}
                          {policy.isInherited
                            ? tx("MANAGE_ACCESS_MODAL.INHERITED_FROM_PARENT")
                            : tx("MANAGE_ACCESS_MODAL.DIRECT_RULE")}
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
                        {tx("MANAGE_ACCESS_MODAL.REMOVE_RULE")}
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
                  <p className="text-sm font-medium">{tx("MANAGE_ACCESS_MODAL.INHERITANCE")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.inheritsParentAccess
                      ? tx("MANAGE_ACCESS_MODAL.THIS_ITEM_FOLLOWS_RULES_FROM_ITS")
                      : tx("MANAGE_ACCESS_MODAL.THIS_ITEM_USES_ONLY_ITS_DIRECT")}
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
                {toggleInheritance.isPending ? tx("MANAGE_ACCESS_MODAL.UPDATING") : inheritanceToggleLabel}
              </Button>
              {item.inheritsParentAccess && ownEntries.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tx("MANAGE_ACCESS_MODAL.ADD_A_DIRECT_ALLOW_RULE_BEFORE")}
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx("common:DONE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
