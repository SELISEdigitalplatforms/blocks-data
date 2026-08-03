"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { Label } from "@/components/ui-kits/label/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  useAccessPolicies,
  useGrantAccess,
  useRevokeAccess,
  useToggleInheritance,
} from "../../hooks/use-dms";
import {
  ContentEffect,
  ContentPermission,
  ContentPrincipalType,
  DmsItem,
} from "../../models/dms.model";

const PRINCIPAL_TYPES: ContentPrincipalType[] = ["User", "Role", "Everyone", "Organization"];
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
 */
export function ManageAccessModal({ open, onOpenChange, item }: Readonly<ManageAccessModalProps>) {
  const policies = useAccessPolicies(open ? item.itemId : undefined);
  const grant = useGrantAccess(item.itemId);
  const revoke = useRevokeAccess(item.itemId);
  const toggleInheritance = useToggleInheritance(item.itemId);

  const [principalType, setPrincipalType] = useState<ContentPrincipalType>("User");
  const [principalId, setPrincipalId] = useState("");
  const [permission, setPermission] = useState<ContentPermission>("View");
  const [effect, setEffect] = useState<ContentEffect>("Allow");

  const rows = policies.data ?? [];
  const ownEntries = rows.filter((p) => !p.isInherited);
  const needsPrincipal = principalType !== "Everyone";
  const canSubmit = !needsPrincipal || principalId.trim().length > 0;

  const handleGrant = async () => {
    try {
      await grant.mutateAsync({
        resourceId: item.itemId,
        resourceType: item.type === "directory" ? "Directory" : "File",
        principalType,
        principalId: needsPrincipal ? principalId.trim() : undefined,
        permission,
        effect,
      });
      showSuccessToast({ title: "Access granted", description: `${permission} on ${item.name}.` });
      setPrincipalId("");
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

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Grant access</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="principal-type">Principal</Label>
                <Select
                  value={principalType}
                  onValueChange={(v) => setPrincipalType(v as ContentPrincipalType)}
                >
                  <SelectTrigger id="principal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINCIPAL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsPrincipal ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="principal-id">
                    {principalType === "Role" ? "Role" : principalType === "Organization" ? "Organization id" : "User id"}
                  </Label>
                  <Input
                    id="principal-id"
                    value={principalId}
                    onChange={(e) => setPrincipalId(e.target.value)}
                    placeholder={principalType === "Role" ? "editors" : "identifier"}
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-1">
                <Label htmlFor="permission">Permission</Label>
                <Select value={permission} onValueChange={(v) => setPermission(v as ContentPermission)}>
                  <SelectTrigger id="permission">
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
                <Label htmlFor="effect">Effect</Label>
                <Select value={effect} onValueChange={(v) => setEffect(v as ContentEffect)}>
                  <SelectTrigger id="effect">
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
