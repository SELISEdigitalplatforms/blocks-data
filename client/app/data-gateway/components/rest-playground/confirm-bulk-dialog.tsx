"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { useT } from "@seliseblocks/genesis-os/i18n";
import type { RestRequest } from "../../rest/rest-client";
import { routedSegments } from "../../rest/route-segments";

export type ConfirmKind = "bulk-update" | "bulk-delete" | "bulk-hard-delete" | "hard-delete";

/**
 * Requests that change many records, or delete for good, are confirmed before they are sent (spec §4.2). It fails
 * closed: the server routes case-insensitively on the decoded path, so the second segment is compared the same way,
 * and one that does not decode counts as `items`. `routeIdFor` stays exact; it only drives hints.
 */
export function needsConfirm(req: RestRequest): ConfirmKind | null {
  if (req.method !== "PATCH" && req.method !== "DELETE") return null;
  const routed = routedSegments(req.path)[1];
  const isItems = routed === null || routed === "items";
  if (req.method === "PATCH") return isItems ? "bulk-update" : null;

  const hardDelete = req.query.some(
    ([key, value]) => key.toLowerCase() === "harddelete" && value.trim().toLowerCase() === "true",
  );
  if (isItems) return hardDelete ? "bulk-hard-delete" : "bulk-delete";
  return hardDelete ? "hard-delete" : null;
}

const COPY: Record<ConfirmKind, { title: string; description: string; action: string }> = {
  "bulk-update": {
    title: "REST_PLAYGROUND.CONFIRM_BULK_UPDATE_TITLE",
    description: "REST_PLAYGROUND.CONFIRM_BULK_DESCRIPTION",
    action: "REST_PLAYGROUND.CONFIRM_UPDATE_RECORDS",
  },
  "bulk-delete": {
    title: "REST_PLAYGROUND.CONFIRM_BULK_DELETE_TITLE",
    description: "REST_PLAYGROUND.CONFIRM_BULK_DESCRIPTION",
    action: "REST_PLAYGROUND.CONFIRM_DELETE_RECORDS",
  },
  "bulk-hard-delete": {
    title: "REST_PLAYGROUND.CONFIRM_BULK_HARD_DELETE_TITLE",
    description: "REST_PLAYGROUND.CONFIRM_BULK_HARD_DELETE_DESCRIPTION",
    action: "REST_PLAYGROUND.CONFIRM_DELETE_PERMANENTLY",
  },
  "hard-delete": {
    title: "REST_PLAYGROUND.CONFIRM_HARD_DELETE_TITLE",
    description: "REST_PLAYGROUND.CONFIRM_HARD_DELETE_DESCRIPTION",
    action: "REST_PLAYGROUND.CONFIRM_DELETE_PERMANENTLY",
  },
};

type ConfirmBulkDialogProps = {
  kind: ConfirmKind | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmBulkDialog({ kind, onCancel, onConfirm }: ConfirmBulkDialogProps) {
  const { t } = useT("data.gateway.schema");
  const copy = kind ? COPY[kind] : null;

  return (
    <Dialog open={copy !== null} onOpenChange={(open) => !open && onCancel()}>
      {copy && (
        <DialogContent className="max-w-md rounded-sm border border-border/40">
          <DialogHeader>
            <DialogTitle className="text-left text-sm font-semibold text-foreground">
              {t(copy.title)}
            </DialogTitle>
            <DialogDescription className="text-left text-sm text-muted-foreground">
              {t(copy.description)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onCancel}
            >
              {t("REST_PLAYGROUND.CANCEL")}
            </Button>
            <Button variant="destructive" size="sm" onClick={onConfirm}>
              {t(copy.action)}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
