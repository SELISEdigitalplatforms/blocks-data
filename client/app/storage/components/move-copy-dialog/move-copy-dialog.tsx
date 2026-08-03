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
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ChevronRight, Folder as DirectoryIcon, FolderInput, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useCopyFile,
  useDmsChildren,
  useDmsDirectory,
  useMoveDmsDirectory,
  useMoveFile,
} from "../../hooks/use-dms";
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

    const names = (detail.fullPath ?? "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    const ancestorIds = detail.ancestorIds ?? [];
    const allIds = [...ancestorIds, startDirectoryId];

    // The path segments must line up with the ids one-to-one (ancestors + self).
    // If they don't — legacy or malformed data — keep the single-entry fallback
    // rather than rendering a misleading trail.
    if (names.length !== allIds.length) return;

    const trail: Crumb[] = [
      { id: undefined, name: "Root" },
      ...allIds.map((id, i) => ({ id, name: names[i] })),
    ];
    setCrumbs(trail);
    // Seed only once per start directory; re-running on every data tick would reset
    // the caller's in-flight navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDirectoryId, directoryDetail.data?.itemId]);

  const children = useDmsChildren(current.id, { type: "directory" });
  const moveFile = useMoveFile();
  const copyFile = useCopyFile();
  const moveDirectory = useMoveDmsDirectory();

  const directories = useMemo(
    () => (children.data?.pages.flatMap((p) => p.items) ?? []).filter(isDirectory),
    [children.data],
  );

  const isPending = moveFile.isPending || copyFile.isPending || moveDirectory.isPending;

  // A directory cannot be moved into itself, and the picker should not offer the
  // item's current parent as a destination for a move that would be a no-op.
  const targetIsSelf = current.id === item.itemId;
  const targetIsCurrentParent = mode === "move" && current.id === item.parentDirectoryId;
  const canConfirm = !!current.id && !targetIsSelf && !targetIsCurrentParent && !isPending;
  const action = mode === "move" ? "Move" : "Copy";

  const handleConfirm = async () => {
    if (!current.id) return;

    try {
      if (isDirectory(item)) {
        await moveDirectory.mutateAsync({
          directoryId: item.itemId,
          targetDirectoryId: current.id,
        });
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
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderInput className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{action} item</DialogTitle>
              <DialogDescription className="line-clamp-1">
                Choose where to {mode === "move" ? "move" : "save a copy of"}{" "}
                <span className="font-medium text-foreground">{item.name}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section aria-labelledby="destination-label" className="space-y-2">
            <p id="destination-label" className="text-sm font-medium">
              Destination
            </p>
            <nav
              aria-label="Destination path"
              className="rounded-lg border bg-muted/30 px-3 py-2.5"
            >
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => {
                  const isCurrent = index === crumbs.length - 1;
                  return (
                    <li
                      key={`${crumb.id ?? "root"}-${crumb.name}`}
                      className="flex items-center gap-1.5"
                    >
                      {index > 0 ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                      <button
                        type="button"
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "max-w-44 truncate rounded px-1 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                          isCurrent
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        disabled={isPending}
                        onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
                      >
                        {crumb.name}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </section>

          <section
            className="overflow-hidden rounded-lg border"
            aria-label="Folders in current destination"
          >
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Folders</p>
                <p className="text-xs text-muted-foreground">
                  Open a folder to make it the destination.
                </p>
              </div>
              {!children.isLoading ? (
                <span className="text-xs text-muted-foreground">{directories.length} shown</span>
              ) : null}
            </div>

            {children.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : children.isError ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Could not load folders. Try again from the main storage view.
              </p>
            ) : directories.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No folders here. You can choose this destination or go back.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto p-2">
                {directories.map((directory) => {
                  const isSelf = directory.itemId === item.itemId;
                  return (
                    <li key={directory.itemId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSelf || isPending}
                        aria-label={
                          isSelf ? `${directory.name} (current item)` : `Open ${directory.name}`
                        }
                        onClick={() =>
                          setCrumbs([...crumbs, { id: directory.itemId, name: directory.name }])
                        }
                      >
                        <DirectoryIcon
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {directory.name}
                        </span>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">Current item</span>
                        ) : (
                          <ChevronRight
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {children.hasNextPage ? (
              <div className="border-t p-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => children.fetchNextPage()}
                  disabled={children.isFetchingNextPage || isPending}
                >
                  {children.isFetchingNextPage ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Loading folders...
                    </>
                  ) : (
                    "Show more folders"
                  )}
                </Button>
              </div>
            ) : null}
          </section>

          <p aria-live="polite" className="text-sm text-muted-foreground">
            {targetIsCurrentParent ? (
              "This item is already in the selected folder."
            ) : (
              <>
                Selected destination:{" "}
                <span className="font-medium text-foreground">{current.name}</span>
              </>
            )}
          </p>
          {isPending ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              {action}ing {item.name}…
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isPending ? `${action}ing...` : `${action} here`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
