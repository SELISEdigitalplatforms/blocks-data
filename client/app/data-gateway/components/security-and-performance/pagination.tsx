"use client";

import { Pagination } from "@/data-gateway/components/shared/pagination";
import {
  PAGE_SIZE_OPTIONS,
  SecurityAndPerformancePaginationProps,
} from "@/data-gateway/models/security-and-performance";

// PAGE_SIZE_OPTIONS kept in model for external consumers
export type { SecurityAndPerformancePaginationProps };
export { PAGE_SIZE_OPTIONS };

const SecurityAndPerformancePagination = ({
  pageNo,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: SecurityAndPerformancePaginationProps) => (
  <Pagination
    pageNo={pageNo}
    totalPages={totalPages}
    totalCount={totalCount}
    pageSize={pageSize}
    isLoading={isLoading}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    className=""
  />
);

export default SecurityAndPerformancePagination;
