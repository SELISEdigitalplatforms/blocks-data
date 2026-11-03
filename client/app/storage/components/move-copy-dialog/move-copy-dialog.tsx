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
import { useMemo, useState } from "react";
import {
  useCopyFile,
  useDmsChildren,
  useDmsDirectory,
  useMoveDmsDirectory,
  useMoveFile,
} from "../../hooks/use-dms";
import { DmsItem, isDirectory } from "../../models/dms.model";
import { useT } from "@seliseblocks/genesis-os/i18n";

export type MoveCopyMode = "move" | "copy";

/** The text keys that differ between moving and copying. */
const MODE_KEYS: Record<MoveCopyMode, Record<"choose" | "pending" | "idle" | "title" | "pendingName", string>> = {
  move: {
    choose: "MOVE_COPY_DIALOG.CHOOSE_WHERE_TO_MOVE",
    pending: "MOVE_COPY_DIALOG.MOVING",
    idle: "MOVE_COPY_DIALOG.MOVE_HERE",
    title: "MOVE_COPY_DIALOG.MOVE_ITEM",
    pendingName: "MOVE_COPY_DIALOG.MOVING_NAME",
  },
  copy: {
    choose: "MOVE_COPY_DIALOG.CHOOSE_WHERE_TO_COPY",
    pending: "MOVE_COPY_DIALOG.COPYING",
    idle: "MOVE_COPY_DIALOG.COPY_HERE",
    title: "MOVE_COPY_DIALOG.COPY_ITEM",
    pendingName: "MOVE_COPY_DIALOG.COPYING_NAME",
  },
};

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
  /** The root crumb has no name of its own; its label is translated where it is shown. */
  isRoot?: boolean;
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
  const { t } = useT("data.storage");
  // The picker starts inside the item's current directory, seeded with the full
  // breadcrumb trail from the root so the caller can navigate UP to ancestors as
  // well as down into children. Without this the picker can only descend, which
  // makes it impossible to move a file into a parent or sibling tree.
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: startDirectoryId, name: "", isRoot: true }]);
  const current = crumbs[crumbs.length - 1];

  const directoryDetail = useDmsDirectory(startDirectoryId);

  // Seed the trail once per start directory, as soon as its detail has loaded. Keyed on the
  // ids rather than the data object, so later data ticks don't reset in-flight navigation.
  const seedKey = `${startDirectoryId ?? ""}|${directoryDetail.data?.itemId ?? ""}`;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (seedKey !== seededKey) {
    setSeededKey(seedKey);
    const trail = buildStartTrail(directoryDetail.data, startDirectoryId);
    if (trail) setCrumbs(trail);
  }

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
  // The item name sits in its own styled span; the sentence is split around it.
  const modeKeys = MODE_KEYS[mode];
  const [descriptionBefore, descriptionAfter] = t(modeKeys.choose, { name: "\u0000" }).split("\u0000");
  const crumbLabel = (crumb: Crumb) => (crumb.isRoot ? t("MOVE_COPY_DIALOG.ROOT") : crumb.name);

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
        title: mode === "move" ? t("MOVE_COPY_DIALOG.MOVED") : t("common:COPIED"),
        description: t("MOVE_COPY_DIALOG.NAME_IS_NOW_IN_NAME2", { name: item.name, name2: crumbLabel(current) }),
      });
      onOpenChange(false);
      onDone?.();
    } catch {
      showErrorToast({
        title: mode === "move" ? t("MOVE_COPY_DIALOG.COULD_NOT_MOVE") : t("MOVE_COPY_DIALOG.COULD_NOT_COPY"),
        errors: t(mode === "move" ? "MOVE_COPY_DIALOG.NAME_WAS_NOT_MOVED" : "MOVE_COPY_DIALOG.NAME_WAS_NOT_COPIED", { name: item.name }),
      });
    }
  };

  const pendingLabel = t(modeKeys.pending);
  const idleLabel = t(modeKeys.idle);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderInput className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{t(modeKeys.title)}</DialogTitle>
              <DialogDescription className="line-clamp-1">
                {descriptionBefore}
                <span className="font-medium text-foreground">{item.name}</span>
                {descriptionAfter}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section aria-labelledby="destination-label" className="space-y-2">
            <p id="destination-label" className="text-sm font-medium">
              {t("MOVE_COPY_DIALOG.DESTINATION")}
            </p>
            <nav
              aria-label={t("MOVE_COPY_DIALOG.DESTINATION_PATH")}
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
                          "max-w-44 truncate rounded px-1 py-0.5 transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring",
                          isCurrent
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        disabled={isPending}
                        onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
                      >
                        {crumbLabel(crumb)}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </section>

          <section
            className="overflow-hidden rounded-lg border"
            aria-label={t("MOVE_COPY_DIALOG.FOLDERS_IN_CURRENT_DESTINATION")}
          >
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{t("MOVE_COPY_DIALOG.FOLDERS")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("MOVE_COPY_DIALOG.OPEN_A_FOLDER_TO_MAKE_IT")}
                </p>
              </div>
              {!children.isLoading ? (
                <span className="text-xs text-muted-foreground">{t("MOVE_COPY_DIALOG.LENGTH_SHOWN", { length: directories.length })}</span>
              ) : null}
            </div>

            {children.isLoading && (
              <div className="space-y-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
            {!children.isLoading && children.isError && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("MOVE_COPY_DIALOG.COULD_NOT_LOAD_FOLDERS_TRY_AGAIN")}
              </p>
            )}
            {!children.isLoading && !children.isError && directories.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("MOVE_COPY_DIALOG.NO_FOLDERS_HERE_YOU_CAN_CHOOSE")}
              </p>
            )}
            {!children.isLoading && !children.isError && directories.length !== 0 && (
              <ul className="max-h-64 overflow-y-auto p-2">
                {directories.map((directory) => {
                  const isSelf = directory.itemId === item.itemId;
                  return (
                    <li key={directory.itemId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted focus:outline-hidden focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSelf || isPending}
                        aria-label={
                          isSelf ? t("MOVE_COPY_DIALOG.NAME_CURRENT_ITEM", { name: directory.name }) : t("MOVE_COPY_DIALOG.OPEN_NAME", { name: directory.name })
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
                          <span className="text-xs text-muted-foreground">{t("MOVE_COPY_DIALOG.CURRENT_ITEM")}</span>
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
                      {t("MOVE_COPY_DIALOG.LOADING_FOLDERS")}
                    </>
                  ) : (
                    t("MOVE_COPY_DIALOG.SHOW_MORE_FOLDERS")
                  )}
                </Button>
              </div>
            ) : null}
          </section>

          <p aria-live="polite" className="text-sm text-muted-foreground">
            {targetIsCurrentParent ? (
              t("MOVE_COPY_DIALOG.THIS_ITEM_IS_ALREADY_IN_THE")
            ) : (
              <>
                {t("MOVE_COPY_DIALOG.SELECTED_DESTINATION")}
                <span className="font-medium text-foreground">{crumbLabel(current)}</span>
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
              {t(modeKeys.pendingName, { name: item.name })}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("common:CANCEL")}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isPending ? pendingLabel : idleLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Breadcrumb trail (Root + ancestors + self) for the start directory, or null when the detail is
 * missing or its path segments don't line up one-to-one with the ids (legacy or malformed data),
 * in which case the single-entry fallback stays.
 */
function buildStartTrail(
  detail: { fullPath?: string | null; ancestorIds?: string[] | null } | undefined,
  startDirectoryId: string | undefined,
): Crumb[] | null {
  if (!detail || !startDirectoryId) return null;
  const names = (detail.fullPath ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const allIds = [...(detail.ancestorIds ?? []), startDirectoryId];
  if (names.length !== allIds.length) return null;
  return [{ id: undefined, name: "", isRoot: true }, ...allIds.map((id, i) => ({ id, name: names[i] }))];
}
