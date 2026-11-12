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
 * The bulk kind a decoded, lower-cased first segment names. Every part after a colon is read, so a path holding a
 * bulk verb anywhere asks (the guard admits only one colon anyway); a segment that does not decode counts as a delete.
 */
function bulkKind(first: string | null | undefined): "bulk-update" | "bulk-delete" | null {
  if (first === undefined) return null;
  if (first === null) return "bulk-delete";
  const verbs = first.split(":").slice(1);
  if (verbs.includes("deletemany")) return "bulk-delete";
  if (verbs.includes("updatemany")) return "bulk-update";
  return null;
}

/**
 * Whether a `hardDelete` value may delete for good. It fails closed (R-V2-15): the server's bool parse also trims `\0`
 * and whitespace a JS `trim()` keeps (U+0085 and others), so any non-blank value other than `false` counts as hard.
 */
function isHardDeleteValue(value: string): boolean {
  const text = value.trim().toLowerCase();
  return text !== "" && text !== "false";
}

/**
 * Requests that change many records, or delete for good, are confirmed before they are sent (spec §4.2, routes-v2 §5).
 * It fails closed: the verb of `POST /{entity}:{verb}` is compared after decoding and in any case (`routedSegments`),
 * so `/E:DELETEMANY` and `/E%3AdeleteMany` still ask though the server refuses the first. `parseGatewayRoute` stays
 * exact; it only drives hints and routing.
 */
export function needsConfirm(req: RestRequest): ConfirmKind | null {
  const hardDelete = req.query.some(
    ([key, value]) => key.toLowerCase() === "harddelete" && isHardDeleteValue(value),
  );
  if (req.method === "DELETE") return hardDelete ? "hard-delete" : null;
  if (req.method !== "POST") return null;

  const kind = bulkKind(routedSegments(req.path)[0]);
  return kind === "bulk-delete" && hardDelete ? "bulk-hard-delete" : kind;
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
