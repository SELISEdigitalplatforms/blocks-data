"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useUpdateDmsFolder } from "@/storage/hooks/use-dms";
import { DmsFolderItem } from "@/storage/models/dms.model";

export interface RenameFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: DmsFolderItem | null;
  onDone?: () => void;
}

/**
 * Renames a folder. The body endpoint reuses the generic folder update, which
 * accepts a new name; only the name is edited here, the description is preserved.
 */
export function RenameFolderDialog({
  open,
  onOpenChange,
  folder,
  onDone,
}: Readonly<RenameFolderDialogProps>) {
  const [name, setName] = useState("");
  const updateFolder = useUpdateDmsFolder();

  useEffect(() => {
    setName(folder?.name ?? "");
  }, [folder]);

  if (!folder) return null;

  const trimmed = name.trim();
  const unchanged = trimmed === folder.name;
  const canSubmit = trimmed.length > 0 && !unchanged && !updateFolder.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await updateFolder.mutateAsync({ folderId: folder.itemId, name: trimmed });

      showSuccessToast({ description: `Renamed to ${trimmed}.` });
      onOpenChange(false);
      onDone?.();
    } catch (err: unknown) {
      showErrorToast({
        errors: isErrorWithErrors(err)
          ? err.errors
          : err instanceof Error
            ? err.message
            : String(err),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>

        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Folder name"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={updateFolder.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {updateFolder.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
