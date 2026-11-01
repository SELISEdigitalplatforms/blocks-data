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
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { HttpError } from "@/lib/http-client";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { MAX_SHARE_PRINCIPALS } from "../../constants/share.constant";
import { useShareObjects } from "../../hooks/use-dms";
import { ObjectPermission, ObjectPrincipalType, SharePrincipalDto } from "../../models/dms.model";
import { PrincipalSelector, usePrincipalSelection } from "../principal-selector/principal-selector";

const PERMISSIONS: ObjectPermission[] = ["View", "Download", "Edit", "Delete", "Manage", "Owner"];


const PRINCIPAL_NOUNS: Record<ObjectPrincipalType, [string, string]> = {
  User: ["user", "users"],
  Role: ["role", "roles"],
  Organization: ["organization", "organizations"],
  Everyone: ["everyone", "everyone"],
};

export interface ShareObjectsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected files and directories, in listing order. */
  items: { itemId: string; name: string }[];
  /** Called once the share succeeded, e.g. to clear the selection. */
  onShared: () => void;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Shares several files and directories with several principals at one permission, in a
 * single all-or-nothing request: either every item is shared with every principal, or
 * nothing changes and the failure names the items that caused it.
 */
export function ShareObjectsModal({ open, onOpenChange, items, onShared }: Readonly<ShareObjectsModalProps>) {
  const selection = usePrincipalSelection(open);
  const { principalType, selectedPrincipals, needsPrincipal } = selection;
  const [permission, setPermission] = useState<ObjectPermission>("View");
  const share = useShareObjects();

  const tooManyPrincipals = selectedPrincipals.length > MAX_SHARE_PRINCIPALS;
  const canSubmit =
    items.length > 0 && (!needsPrincipal || selectedPrincipals.length > 0) && !tooManyPrincipals;

  const nameOf = (resourceId: string) =>
    items.find((item) => item.itemId === resourceId)?.name ?? resourceId;

  const failureMessage = (error: unknown): string => {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
      const ids = (error.errors as { resourceIds?: unknown }).resourceIds;
      const names = Array.isArray(ids) && ids.length > 0 ? ids.map(String).map(nameOf).join(", ") : "";
      if (error.status === 403) {
        return names ? `You can't manage access on: ${names}` : "You can't manage access on these items.";
      }
      return names ? `Some items no longer exist: ${names}` : "Some items no longer exist.";
    }
    return "The items were not shared.";
  };

  const handleShare = async () => {
    const principals: SharePrincipalDto[] = needsPrincipal
      ? selectedPrincipals.map((principalId) => ({
          principalType,
          principalId,
          organizationId: selection.roleScopeOrganizationId,
        }))
      : [{ principalType }];

    try {
      await share.mutateAsync({
        resourceIds: items.map((item) => item.itemId),
        principals,
        permission,
      });
      const [one, many] = PRINCIPAL_NOUNS[principalType];
      showSuccessToast({
        title: "Shared",
        description: `${permission} on ${plural(items.length, "item", "items")} for ${
          needsPrincipal ? plural(principals.length, one, many) : "everyone"
        }.`,
      });
      selection.clearPicks();
      onShared();
      onOpenChange(false);
    } catch (error) {
      showErrorToast({ title: "Nothing was shared", errors: failureMessage(error) });
    }
  };

  const visibleNames = items.slice(0, 3).map((item) => item.name);
  const hiddenCount = items.length - visibleNames.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Share2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Share {plural(items.length, "item", "items")}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {visibleNames.join(", ")}
                {hiddenCount > 0 ? ` and ${hiddenCount} more` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <PrincipalSelector
            selection={selection}
            hint="You can select more than one. Every selected item is shared with each of them."
          />
          {tooManyPrincipals ? (
            <p className="text-sm text-destructive">
              Share with up to {MAX_SHARE_PRINCIPALS} at a time.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="share-permission">
              Permission
            </label>
            <Select value={permission} onValueChange={(v) => setPermission(v as ObjectPermission)}>
              <SelectTrigger id="share-permission" aria-label="Permission">
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

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Preview</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {needsPrincipal && selectedPrincipals.length > 0 ? (
                selection.options
                  .filter((o) => selectedPrincipals.includes(o.value))
                  .map((o) => (
                    <Badge key={o.value} variant="secondary">
                      {o.label}
                    </Badge>
                  ))
              ) : (
                <span className="text-muted-foreground">
                  {needsPrincipal ? `Choose ${principalType.toLowerCase()}s to continue.` : "Everyone"}
                </span>
              )}
              <Badge variant="outline">{permission}</Badge>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={!canSubmit || share.isPending}>
            {share.isPending ? "Sharing..." : "Share"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
