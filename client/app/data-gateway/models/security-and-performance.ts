export interface Schema {
  id: string;
  schemaName: string;
  readAccessLevel: number;
  writeAccessLevel: number;
  editAccessLevel: number;
  deleteAccessLevel: number;
}

export interface SecurityTableProps {
  schemas: Schema[];
  onRowClick: (schema: Schema) => void;
}

export interface SecurityAndPerformancePaginationProps {
  pageNo: number;
  totalPages: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

export const PAGE_SIZE_OPTIONS = [10, 50, 100, 200] as const;
