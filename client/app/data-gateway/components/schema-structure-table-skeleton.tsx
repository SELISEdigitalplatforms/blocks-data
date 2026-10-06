import { Card } from "@/components/ui-kits/card/card";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";

/**
 * Stand-in for the field table while a schema loads.
 *
 * Every dimension here is taken from `SchemaStructureTable`'s real markup
 * rather than invented: the same `rounded-t-none border-t-0` card that joins
 * the header card above it, the same `h-8` tab strip, the same read-mode
 * column percentages, and `TableHead`/`TableCell` so rows are the primitives'
 * own height. The old placeholder used `h-[calc(100vh-447px)]`, a nine-column
 * grid the table no longer has, and a full rounded border — so the whole panel
 * visibly re-laid itself out the instant data arrived.
 */

/** Read mode, no Rules column — what an unloaded schema resolves to most often. */
const COLUMN_WIDTHS = ["24%", "18%", "11%", "15%", "32%"];

const HEADER_LABEL_WIDTHS = ["w-20", "w-12", "w-16", "w-12", "w-24"];

export const SchemaStructureTableSkeleton = () => {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-none border-t-0 shadow-none">
      {/* Tab strip — matches SchemaStructureHeader's h-8 triggers and its
          card-width rule */}
      <div className="-mx-5 flex shrink-0 items-center justify-between border-b border-border/40 px-5">
        <div className="flex h-8 items-center gap-1">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="ml-6 h-4 w-10 rounded" />
          <Skeleton className="ml-6 h-4 w-14 rounded" />
        </div>
        <Skeleton className="h-9 w-14 rounded-sm" />
      </div>

      {/* Mobile card list — the table is xl-only, same as the real one */}
      <div className="mt-4 space-y-3 xl:hidden">
        {Array.from({ length: 4 }).map((_, card) => (
          <div
            key={`skeleton-card-${card}`}
            className="space-y-3 rounded-sm border border-border/40 bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-[22px] w-[74px] rounded-md" />
              <Skeleton className="h-[22px] w-[56px] rounded-md" />
            </div>
            <Skeleton className="h-4 w-[80%] rounded" />
          </div>
        ))}
      </div>

      <ScrollArea className="mt-4 hidden min-h-0 flex-1 xl:block [scrollbar-gutter:stable]">
        <Table className="w-full table-fixed">
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={`skeleton-col-${index}`} style={{ width }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              {HEADER_LABEL_WIDTHS.map((width, index) => (
                <TableHead key={`skeleton-head-${index}`}>
                  <Skeleton className={`h-3.5 ${width} rounded`} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, row) => (
              <TableRow key={`skeleton-row-${row}`}>
                <TableCell>
                  <Skeleton className="h-4 w-[70%] rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-[22px] w-[74px] rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-10 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-[22px] w-[56px] rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-[85%] rounded" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  );
};
