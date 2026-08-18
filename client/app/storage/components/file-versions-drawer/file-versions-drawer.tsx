"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui-kits/sheet/sheet";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useMemo } from "react";
import { useFileVersions } from "../../hooks/use-dms";
import { DmsItem, FileVersionDto } from "../../models/dms.model";

export interface FileVersionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: DmsItem;
  /** Called with the version the user asked to download. */
  onDownloadVersion?: (version: FileVersionDto) => void;
}

const formatSize = (bytes: number): string => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatDate = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : "");

/**
 * The version history of one file, newest first, paged by cursor.
 *
 * Versions are immutable on the server, so nothing here edits one. The only
 * actions are reading the list and fetching a particular version, which is why
 * the whole drawer is gated on download rather than edit.
 */
export function FileVersionsDrawer({
  open,
  onOpenChange,
  file,
  onDownloadVersion,
}: Readonly<FileVersionsDrawerProps>) {
  const query = useFileVersions(open ? file.itemId : undefined);

  const versions = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Versions of {file.name}</SheetTitle>
        </SheetHeader>

        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">This file has no recorded versions.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {versions.map((version) => (
              <li key={version.itemId} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0 font-medium">v{version.no}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(version.createdDate)}
                  </span>
                  {version.uploadedBy ? (
                    <span className="truncate text-xs text-muted-foreground">
                      by {version.uploadedBy}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatSize(version.sizeInBytes)}
                </span>
                {onDownloadVersion ? (
                  <Button variant="outline" size="sm" onClick={() => onDownloadVersion(version)}>
                    Download
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {query.hasNextPage ? (
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="self-center"
          >
            {query.isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
