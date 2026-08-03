"use client";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
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
import { useState } from "react";
import {
  useAccessPolicies,
  useGrantAccess,
  useIamOrganizations,
  useIamRoles,
  useIamUsers,
  useRevokeAccess,
  useToggleInheritance,
} from "../../hooks/use-dms";
import {
  ContentEffect,
  ContentPermission,
  ContentPrincipalType,
  DmsItem,
} from "../../models/dms.model";
import { PrincipalPicker } from "../principal-picker/principal-picker";

const PRINCIPAL_TYPES: ContentPrincipalType[] = ["User", "Role", "Organization", "Everyone"];
const PERMISSIONS: ContentPermission[] = ["View", "Download", "Edit", "Delete", "Manage", "Owner"];
const EFFECTS: ContentEffect[] = ["Allow", "Deny"];

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
  const policies = useAccessPolicies(open ? item.itemId : undefined);
  const grant = useGrantAccess(item.itemId);
  const revoke = useRevokeAccess(item.itemId);
  const toggleInheritance = useToggleInheritance(item.itemId);

  const [principalType, setPrincipalType] = useState<ContentPrincipalType>("User");
  const [permission, setPermission] = useState<ContentPermission>("View");
  const [effect, setEffect] = useState<ContentEffect>("Allow");
  const [selectedPrincipals, setSelectedPrincipals] = useState<string[]>([]);

  const rows = policies.data ?? [];
  const ownEntries = rows.filter((p) => !p.isInherited);
  const needsPrincipal = principalType !== "Everyone";
  const canSubmit = !needsPrincipal || selectedPrincipals.length > 0;

  // Reset the selection whenever the principal type changes — a user id and a
  // role slug are not interchangeable, so carrying one over to the next list
  // would create invalid grants. Done in the change handler (rather than an
  // effect) to avoid cascading renders.
  const handlePrincipalTypeChange = (next: ContentPrincipalType) => {
    setPrincipalType(next);
    setSelectedPrincipals([]);
    setSearch("");
  };

  // The IAM search hooks are wired unconditionally so their cache keys are
  // stable; each one stays dormant (`enabled: false`) until the matching
  // principal type is selected, and only re-queries when the user has typed.
  const [search, setSearch] = useState("");
  const users = useIamUsers(search, open && principalType === "User");
  const roles = useIamRoles(search, open && principalType === "Role");
  const organizations = useIamOrganizations(
    search,
    open && principalType === "Organization",
  );

  const options =
    principalType === "User"
      ? users.data ?? []
      : principalType === "Role"
        ? roles.data ?? []
        : principalType === "Organization"
          ? organizations.data ?? []
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage access to {item.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Current access</h3>

            {policies.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entries of its own. Access comes from the parent directory.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border text-sm">
                {rows.map((policy) => (
                  <li key={policy.itemId} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      {policy.principalType}
                      {policy.principalId ? `: ${policy.principalId}` : ""}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {policy.effect} {policy.permission}
                    </span>
                    {policy.isInherited ? (
                      <span className="shrink-0 text-xs text-muted-foreground">inherited</span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(policy.itemId)}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h3 className="text-sm font-medium">Grant access</h3>

            {/* Step 1 — pick who. Four chips; Everyone needs no further selection. */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">1. Who gets access</span>
              <div className="flex flex-wrap gap-2">
                {PRINCIPAL_TYPES.map((t) => {
                  const active = principalType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handlePrincipalTypeChange(t)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent",
                      )}
                      aria-pressed={active}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2 — pick the principal(s). Hidden for Everyone. */}
            {needsPrincipal ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">2. Choose {principalType.toLowerCase()}(s)</span>
                <PrincipalPicker
                  label={
                    principalType === "Role"
                      ? "Roles"
                      : principalType === "Organization"
                        ? "Organizations"
                        : "Users"
                  }
                  options={options}
                  selected={selectedPrincipals}
                  onChange={setSelectedPrincipals}
                  isLoading={isLoading}
                  onSearchChange={setSearch}
                  hint="Pick one or more. Each becomes its own access entry."
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Everyone matches any authenticated caller, so no selection is needed.
              </p>
            )}

            {/* Step 3 — what they may do, and whether it is allowed or denied. */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">3. Access type &amp; effect</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Select
                    value={permission}
                    onValueChange={(v) => setPermission(v as ContentPermission)}
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

                <div className="flex flex-col gap-1">
                  <Select value={effect} onValueChange={(v) => setEffect(v as ContentEffect)}>
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

            {/* Summary of what will be granted, derived from the current picks. */}
            {needsPrincipal && selectedPrincipals.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
                <span className="text-muted-foreground">Will grant:</span>
                {options
                  .filter((o) => selectedPrincipals.includes(o.value))
                  .map((o) => (
                    <Badge key={o.value} variant="secondary">
                      {principalType}: {o.label}
                    </Badge>
                  ))}
                <span className="text-muted-foreground">
                  → {effect} {permission}
                </span>
              </div>
            ) : null}

            <Button onClick={handleGrant} disabled={!canSubmit || grant.isPending} className="self-start">
              {grant.isPending ? "Granting..." : "Grant"}
            </Button>
          </section>

          <section className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Inherit access from the parent directory</span>
              <span className="text-xs text-muted-foreground">
                {item.inheritsParentAccess
                  ? "This item follows its parent."
                  : "This item uses only its own entries."}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleInheritance}
              // Switching inheritance off with nothing else granting access would
              // hide the item from everyone, so the server refuses it. Disabling
              // here states the rule instead of waiting for the rejection.
              disabled={
                toggleInheritance.isPending ||
                (item.inheritsParentAccess && ownEntries.length === 0)
              }
            >
              {item.inheritsParentAccess ? "Turn off" : "Turn on"}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
