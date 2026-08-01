"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { ChevronRight, Folder as FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useCopyFile, useDmsChildren, useMoveDmsFolder, useMoveFile } from "../../hooks/use-dms";
import { DmsItem, isFolder } from "../../models/dms.model";

export type MoveCopyMode = "move" | "copy";

export interface MoveCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DmsItem;
  mode: MoveCopyMode;
  /** Folder the picker starts in. Undefined browses from the root. */
  startFolderId?: string;
  onDone?: () => void;
}

interface Crumb {
  id?: string;
  name: string;
}

/**
 * Picks a destination folder for a move or a copy.
 *
 * The picker browses with the same access-resolved listing the main view uses,
 * so a folder the caller cannot see is not offered as a destination. Only
 * folders are shown; a file is never a destination.
 *
 * Copy is zero-copy on the server: the new file points at the same stored
 * object, because versions are immutable. That is why copying a large file
 * returns as quickly as a small one.
 */
export function MoveCopyDialog({
  open,
  onOpenChange,
  item,
  mode,
  startFolderId,
  onDone,
}: Readonly<MoveCopyDialogProps>) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: startFolderId, name: "Root" }]);
  const current = crumbs[crumbs.length - 1];

  const children = useDmsChildren(current.id, { type: "folder" });
  const moveFile = useMoveFile();
  const copyFile = useCopyFile();
  const moveFolder = useMoveDmsFolder();

  const folders = useMemo(
    () => (children.data?.pages.flatMap((p) => p.items) ?? []).filter(isFolder),
    [children.data],
  );

  const isPending = moveFile.isPending || copyFile.isPending || moveFolder.isPending;

  // A folder cannot be moved into itself, and the picker should not offer the
  // item's current parent as a destination for a move that would be a no-op.
  const targetIsSelf = current.id === item.itemId;
  const targetIsCurrentParent = mode === "move" && current.id === item.parentDirectoryId;
  const canConfirm = !!current.id && !targetIsSelf && !targetIsCurrentParent && !isPending;

  const handleConfirm = async () => {
    if (!current.id) return;

    try {
      if (isFolder(item)) {
        await moveFolder.mutateAsync({ folderId: item.itemId, targetFolderId: current.id });
      } else if (mode === "move") {
        await moveFile.mutateAsync({ fileId: item.itemId, targetFolderId: current.id });
      } else {
        await copyFile.mutateAsync({ fileId: item.itemId, targetFolderId: current.id });
      }

      showSuccessToast({
        title: mode === "move" ? "Moved" : "Copied",
        description: `${item.name} is now in ${current.name}.`,
      });
      onOpenChange(false);
      onDone?.();
    } catch {
      showErrorToast({
        title: mode === "move" ? "Could not move" : "Could not copy",
        errors: `${item.name} was not ${mode === "move" ? "moved" : "copied"}.`,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "move" ? "Move" : "Copy"} {item.name}
          </DialogTitle>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.id ?? "root"}-${crumb.name}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : null}
              <button
                type="button"
                className="hover:underline"
                onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {children.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : folders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No folders here. Choose this one, or go back.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border text-sm">
            {folders.map((folder) => (
              <li key={folder.itemId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  disabled={folder.itemId === item.itemId}
                  onClick={() => setCrumbs([...crumbs, { id: folder.itemId, name: folder.name }])}
                >
                  <FolderIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                  {folder.itemId === item.itemId ? (
                    <span className="ml-auto text-xs text-muted-foreground">itself</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isPending
              ? mode === "move"
                ? "Moving..."
                : "Copying..."
              : `${mode === "move" ? "Move" : "Copy"} here`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
