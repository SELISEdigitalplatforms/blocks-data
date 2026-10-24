"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  getVisiblePageSizeOptions,
  isPaginationRedundant,
} from "@/components/ui-kits/pagination/pagination-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { cn } from "@/lib/utils";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200] as const;

interface PaginationProps {
  pageNo: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
  className?: string;
}

export function Pagination({
  pageNo,
  pageSize,
  totalPages,
  totalCount,
  isLoading,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  if (isPaginationRedundant(PAGE_SIZE_OPTIONS, totalCount, pageSize, pageNo <= 1)) return null;

  const pageCount = Math.max(1, totalPages);
  const pageSizeOptions = getVisiblePageSizeOptions(PAGE_SIZE_OPTIONS, totalCount, pageSize);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-4 border-t border-border/50 px-5 py-3",
        className,
      )}
    >
      {pageSizeOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={onPageSizeChange} disabled={isLoading}>
            <SelectTrigger className="h-7 w-[72px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Page {pageNo} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={pageNo <= 1 || isLoading}
            onClick={() => onPageChange(1)}
            title="First page"
          >
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={pageNo <= 1 || isLoading}
            onClick={() => onPageChange(pageNo - 1)}
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={pageNo >= pageCount || isLoading}
            onClick={() => onPageChange(pageNo + 1)}
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={pageNo >= pageCount || isLoading}
            onClick={() => onPageChange(pageCount)}
            title="Last page"
          >
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
