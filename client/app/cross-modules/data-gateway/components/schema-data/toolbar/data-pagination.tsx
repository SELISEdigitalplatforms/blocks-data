"use client";

import { Pagination } from "@/cross-modules/data-gateway/components/shared/pagination";

interface DataPaginationProps {
  pageNo: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

export function DataPagination(props: DataPaginationProps) {
  return <Pagination {...props} className="pt-2" />;
}
