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
import { useRenameFile } from "@/storage/hooks/use-dms";
import { DmsFileItem } from "@/storage/models/dms.model";
import { LoaderCircle } from "lucide-react";

export interface RenameFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: DmsFileItem | null;
  onDone?: () => void;
}

export function RenameFileDialog({
  open,
  onOpenChange,
  file,
  onDone,
}: Readonly<RenameFileDialogProps>) {
  const [name, setName] = useState("");
  const renameFile = useRenameFile();

  useEffect(() => {
    setName(file?.name ?? "");
  }, [file]);

  if (!file) return null;

  const trimmed = name.trim();
  const unchanged = trimmed === file.name;
  const canSubmit = trimmed.length > 0 && !unchanged && !renameFile.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await renameFile.mutateAsync({ fileId: file.itemId, name: trimmed });

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
          <DialogTitle>Rename file</DialogTitle>
        </DialogHeader>

        <Input
          value={name}
          autoFocus
          disabled={renameFile.isPending}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="File name"
        />

        {renameFile.isPending ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Renaming file…
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={renameFile.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {renameFile.isPending ? "Renaming…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
