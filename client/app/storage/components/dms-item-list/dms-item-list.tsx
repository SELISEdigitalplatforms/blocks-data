import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { File as FileIcon, Folder as DirectoryIcon } from "lucide-react";
import { ReactNode } from "react";
import { DmsItem } from "../../models/dms.model";

export interface DmsItemListProps {
  items: DmsItem[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onOpen?: (item: DmsItem) => void;
  /** Rendered at the end of each row, typically a menu. */
  renderActions?: (item: DmsItem) => ReactNode;
  emptyMessage?: string;
}

const formatSize = (bytes: number | undefined): string => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

/**
 * A flat list of directorys and files with a cursor-driven "load more".
 *
 * Deliberately not built on `app/components/infinite-scroller`, which the
 * specification suggests reusing: that component is written for a polling log
 * stream and takes `topFn`, `pollingFn` and a polling interval. Cursor paging
 * from `useInfiniteQuery` has neither a poll nor a top edge, so wiring it there
 * would have meant passing no-op callbacks and an interval that never fires.
 *
 * Paging is an explicit button rather than a scroll sentinel because a page here
 * can come back shorter than the requested limit: access filtering happens after
 * the read, so "fewer than asked for" does not mean "the end". An explicit
 * control makes that visible instead of leaving a scroll listener guessing.
 */
export function DmsItemList({
  items,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  onOpen,
  renderActions,
  emptyMessage = "Nothing here.",
}: Readonly<DmsItemListProps>) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="dms-item-list-loading">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-md border">
        {items.map((item) => {
          const isDirectory = item.type === "directory";
          const Icon = isDirectory ? DirectoryIcon : FileIcon;

          return (
            <li key={item.itemId} className="flex items-center gap-3 px-3 py-2">
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left hover:underline"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                </span>
              )}

              <span className="shrink-0 text-xs text-muted-foreground">
                {isDirectory ? "Directory" : formatSize((item as { sizeInBytes?: number }).sizeInBytes)}
              </span>

              {renderActions ? <span className="shrink-0">{renderActions(item)}</span> : null}
            </li>
          );
        })}
      </ul>

      {hasNextPage ? (
        <Button
          variant="outline"
          onClick={() => onLoadMore?.()}
          disabled={isFetchingNextPage}
          className="self-center"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
