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
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { MAX_SHARE_PRINCIPALS } from "../../constants/share.constant";
import { useShareObjects } from "../../hooks/use-dms";
import { ObjectPermission, ObjectPrincipalType, SharePrincipalDto } from "../../models/dms.model";
import { PrincipalSelector, usePrincipalSelection } from "../principal-selector/principal-selector";

const PERMISSIONS: ObjectPermission[] = ["View", "Download", "Edit", "Delete", "Manage", "Owner"];

const PRINCIPAL_COUNT_KEYS: Record<ObjectPrincipalType, string> = {
  User: "SHARE_OBJECTS_MODAL.USERS_COUNT",
  Role: "SHARE_OBJECTS_MODAL.ROLES_COUNT",
  Organization: "SHARE_OBJECTS_MODAL.ORGANIZATIONS_COUNT",
  Everyone: "SHARE_OBJECTS_MODAL.EVERYONE_LOWER",
};

const CHOOSE_KEYS: Record<ObjectPrincipalType, string> = {
  User: "SHARE_OBJECTS_MODAL.CHOOSE_USERS_TO_CONTINUE",
  Role: "SHARE_OBJECTS_MODAL.CHOOSE_ROLES_TO_CONTINUE",
  Organization: "SHARE_OBJECTS_MODAL.CHOOSE_ORGANIZATIONS_TO_CONTINUE",
  Everyone: "SHARE_OBJECTS_MODAL.EVERYONE",
};

export interface ShareObjectsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected files and directories, in listing order. */
  items: { itemId: string; name: string }[];
  /** Called once the share succeeded, e.g. to clear the selection. */
  onShared: () => void;
}

/**
 * Shares several files and directories with several principals at one permission, in a
 * single all-or-nothing request: either every item is shared with every principal, or
 * nothing changes and the failure names the items that caused it.
 */
export function ShareObjectsModal({ open, onOpenChange, items, onShared }: Readonly<ShareObjectsModalProps>) {
  const { t } = useT("data.storage");
  const selection = usePrincipalSelection(open);
  const { principalType, selectedPrincipals, needsPrincipal } = selection;
  const [permission, setPermission] = useState<ObjectPermission>("View");
  const share = useShareObjects();

  const tooManyPrincipals = selectedPrincipals.length > MAX_SHARE_PRINCIPALS;
  const canSubmit =
    items.length > 0 && (!needsPrincipal || selectedPrincipals.length > 0) && !tooManyPrincipals;

  const nameOf = (resourceId: string) =>
    items.find((item) => item.itemId === resourceId)?.name ?? resourceId;

  const permissionLabels: Record<ObjectPermission, string> = {
    View: t("SHARE_OBJECTS_MODAL.PERMISSION_VIEW"),
    Download: t("SHARE_OBJECTS_MODAL.PERMISSION_DOWNLOAD"),
    Edit: t("SHARE_OBJECTS_MODAL.PERMISSION_EDIT"),
    Delete: t("SHARE_OBJECTS_MODAL.PERMISSION_DELETE"),
    Manage: t("SHARE_OBJECTS_MODAL.PERMISSION_MANAGE"),
    Owner: t("SHARE_OBJECTS_MODAL.PERMISSION_OWNER"),
  };

  const failureMessage = (error: unknown): string => {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
      const ids = (error.errors as { resourceIds?: unknown }).resourceIds;
      const names = Array.isArray(ids) && ids.length > 0 ? ids.map(String).map(nameOf).join(", ") : "";
      if (error.status === 403) {
        return names
          ? t("SHARE_OBJECTS_MODAL.CANT_MANAGE_ACCESS_ON_NAMES", { names })
          : t("SHARE_OBJECTS_MODAL.CANT_MANAGE_ACCESS_ON_THESE_ITEMS");
      }
      return names
        ? t("SHARE_OBJECTS_MODAL.ITEMS_NO_LONGER_EXIST_NAMES", { names })
        : t("SHARE_OBJECTS_MODAL.ITEMS_NO_LONGER_EXIST");
    }
    return t("SHARE_OBJECTS_MODAL.ITEMS_NOT_SHARED");
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
      showSuccessToast({
        title: t("SHARE_OBJECTS_MODAL.SHARED"),
        description: t("SHARE_OBJECTS_MODAL.SHARED_DESCRIPTION", {
          permission: permissionLabels[permission],
          items: t("SHARE_OBJECTS_MODAL.ITEMS_COUNT", { count: items.length }),
          principals: needsPrincipal
            ? t(PRINCIPAL_COUNT_KEYS[principalType], { count: principals.length })
            : t(PRINCIPAL_COUNT_KEYS.Everyone),
        }),
      });
      selection.clearPicks();
      onShared();
      onOpenChange(false);
    } catch (error) {
      showErrorToast({ title: t("SHARE_OBJECTS_MODAL.NOTHING_WAS_SHARED"), errors: failureMessage(error) });
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
              <DialogTitle>{t("SHARE_OBJECTS_MODAL.SHARE_ITEMS_TITLE", { count: items.length })}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {hiddenCount > 0
                  ? t("SHARE_OBJECTS_MODAL.NAMES_AND_MORE", { names: visibleNames.join(", "), count: hiddenCount })
                  : visibleNames.join(", ")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <PrincipalSelector
            selection={selection}
            hint={t("SHARE_OBJECTS_MODAL.HINT")}
          />
          {tooManyPrincipals ? (
            <p className="text-sm text-destructive">
              {t("SHARE_OBJECTS_MODAL.SHARE_WITH_UP_TO", { max: MAX_SHARE_PRINCIPALS })}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="share-permission">
              {t("SHARE_OBJECTS_MODAL.PERMISSION")}
            </label>
            <Select value={permission} onValueChange={(v) => setPermission(v as ObjectPermission)}>
              <SelectTrigger id="share-permission" aria-label={t("SHARE_OBJECTS_MODAL.PERMISSION")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {permissionLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{t("SHARE_OBJECTS_MODAL.PREVIEW")}</p>
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
                  {t(CHOOSE_KEYS[principalType])}
                </span>
              )}
              <Badge variant="outline">{permissionLabels[permission]}</Badge>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button onClick={handleShare} disabled={!canSubmit || share.isPending}>
            {share.isPending ? t("SHARE_OBJECTS_MODAL.SHARING") : t("SHARE_OBJECTS_MODAL.SHARE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
