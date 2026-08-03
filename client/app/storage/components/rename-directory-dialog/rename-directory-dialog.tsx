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
import { useUpdateDmsDirectory } from "@/storage/hooks/use-dms";
import { DmsDirectoryItem } from "@/storage/models/dms.model";

export interface RenameDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: DmsDirectoryItem | null;
  onDone?: () => void;
}

/**
 * Renames a directory. The body endpoint reuses the generic directory update, which
 * accepts a new name; only the name is edited here, the description is preserved.
 */
export function RenameDirectoryDialog({
  open,
  onOpenChange,
  directory,
  onDone,
}: Readonly<RenameDirectoryDialogProps>) {
  const [name, setName] = useState("");
  const updateDirectory = useUpdateDmsDirectory();

  useEffect(() => {
    setName(directory?.name ?? "");
  }, [directory]);

  if (!directory) return null;

  const trimmed = name.trim();
  const unchanged = trimmed === directory.name;
  const canSubmit = trimmed.length > 0 && !unchanged && !updateDirectory.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await updateDirectory.mutateAsync({ directoryId: directory.itemId, name: trimmed });

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
          <DialogTitle>Rename directory</DialogTitle>
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
          placeholder="Directory name"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={updateDirectory.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {updateDirectory.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
