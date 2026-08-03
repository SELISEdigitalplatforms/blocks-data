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
import { ChevronRight, Folder as DirectoryIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCopyFile, useDmsChildren, useDmsDirectory, useMoveDmsDirectory, useMoveFile } from "../../hooks/use-dms";
import { DmsItem, isDirectory } from "../../models/dms.model";

export type MoveCopyMode = "move" | "copy";

export interface MoveCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DmsItem;
  mode: MoveCopyMode;
  /** Directory the picker starts in. Undefined browses from the root. */
  startDirectoryId?: string;
  onDone?: () => void;
}

interface Crumb {
  id?: string;
  name: string;
}

/**
 * Picks a destination directory for a move or a copy.
 *
 * The picker browses with the same access-resolved listing the main view uses,
 * so a directory the caller cannot see is not offered as a destination. Only
 * directorys are shown; a file is never a destination.
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
  startDirectoryId,
  onDone,
}: Readonly<MoveCopyDialogProps>) {
  // The picker starts inside the item's current directory, seeded with the full
  // breadcrumb trail from the root so the caller can navigate UP to ancestors as
  // well as down into children. Without this the picker can only descend, which
  // makes it impossible to move a file into a parent or sibling tree.
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: startDirectoryId, name: "Root" }]);
  const current = crumbs[crumbs.length - 1];

  const directoryDetail = useDmsDirectory(startDirectoryId);

  useEffect(() => {
    const detail = directoryDetail.data;
    if (!detail || !startDirectoryId) return;

    const names = (detail.fullPath ?? "").split("/").map((s) => s.trim()).filter(Boolean);
    const ancestorIds = detail.ancestorIds ?? [];
    const allIds = [...ancestorIds, startDirectoryId];

    // The path segments must line up with the ids one-to-one (ancestors + self).
    // If they don't — legacy or malformed data — keep the single-entry fallback
    // rather than rendering a misleading trail.
    if (names.length !== allIds.length) return;

    const trail: Crumb[] = [{ id: undefined, name: "Root" }, ...allIds.map((id, i) => ({ id, name: names[i] }))];
    setCrumbs(trail);
    // Seed only once per start directory; re-running on every data tick would reset
    // the caller's in-flight navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDirectoryId, directoryDetail.data?.itemId]);

  const children = useDmsChildren(current.id, { type: "directory" });
  const moveFile = useMoveFile();
  const copyFile = useCopyFile();
  const moveDirectory = useMoveDmsDirectory();

  const directorys = useMemo(
    () => (children.data?.pages.flatMap((p) => p.items) ?? []).filter(isDirectory),
    [children.data],
  );

  const isPending = moveFile.isPending || copyFile.isPending || moveDirectory.isPending;

  // A directory cannot be moved into itself, and the picker should not offer the
  // item's current parent as a destination for a move that would be a no-op.
  const targetIsSelf = current.id === item.itemId;
  const targetIsCurrentParent = mode === "move" && current.id === item.parentDirectoryId;
  const canConfirm = !!current.id && !targetIsSelf && !targetIsCurrentParent && !isPending;

  const handleConfirm = async () => {
    if (!current.id) return;

    try {
      if (isDirectory(item)) {
        await moveDirectory.mutateAsync({ directoryId: item.itemId, targetDirectoryId: current.id });
      } else if (mode === "move") {
        await moveFile.mutateAsync({ fileId: item.itemId, targetDirectoryId: current.id });
      } else {
        await copyFile.mutateAsync({ fileId: item.itemId, targetDirectoryId: current.id });
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
        ) : directorys.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No directorys here. Choose this one, or go back.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border text-sm">
            {directorys.map((directory) => (
              <li key={directory.itemId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  disabled={directory.itemId === item.itemId}
                  onClick={() => setCrumbs([...crumbs, { id: directory.itemId, name: directory.name }])}
                >
                  <DirectoryIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{directory.name}</span>
                  {directory.itemId === item.itemId ? (
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
