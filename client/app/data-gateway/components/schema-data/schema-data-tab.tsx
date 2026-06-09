"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Braces, List, RefreshCw, Table2 } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useExecuteGraphQL } from "@/data-gateway/hooks/use-configuration";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { HttpError } from "@/lib/http-client";
import { DataListView } from "./data-list-view";
import { DataJsonView } from "./data-json-view";
import { DataTableView } from "./data-table-view";
import { FilterPopover } from "./toolbar/filter-popover";
import { ProjectionPopover } from "./toolbar/projection-popover";
import { SortPopover } from "./toolbar/sort-popover";
import { ResetButton } from "./toolbar/reset-button";
import { DataPagination } from "./toolbar/data-pagination";

type ViewMode = "list" | "json" | "table";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200] as const;

interface TemplateField {
  name: string;
  type?: string | null;
  isArray: boolean;
  isPIIData?: boolean;
  isUniqueData?: boolean;
}

interface SchemaDataTabProps {
  schemaName: string;
  fields: TemplateField[];
  previewData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSelectionFields(
  fields: TemplateField[],
  previewData: Record<string, unknown>,
  indentLevel = 3,
): string[] {
  const indent = "  ".repeat(indentLevel);
  const lines: string[] = [];

  const formatNested = (
    obj: Record<string, unknown>,
    level: number,
  ): string[] => {
    const nestedIndent = "  ".repeat(level);
    const nestedLines: string[] = [];
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (
        Array.isArray(val) &&
        val.length > 0 &&
        typeof val[0] === "object" &&
        val[0] !== null
      ) {
        nestedLines.push(`${nestedIndent}${key} {`);
        nestedLines.push(
          ...formatNested(val[0] as Record<string, unknown>, level + 1),
        );
        nestedLines.push(`${nestedIndent}}`);
      } else if (
        typeof val === "object" &&
        val !== null &&
        !Array.isArray(val)
      ) {
        nestedLines.push(`${nestedIndent}${key} {`);
        nestedLines.push(
          ...formatNested(val as Record<string, unknown>, level + 1),
        );
        nestedLines.push(`${nestedIndent}}`);
      } else {
        nestedLines.push(`${nestedIndent}${key}`);
      }
    });
    return nestedLines;
  };

  fields.forEach((field) => {
    if (field.name in previewData) {
      const fieldValue = previewData[field.name];

      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        const firstItem = fieldValue[0];
        if (typeof firstItem === "object" && firstItem !== null) {
          lines.push(`${indent}${field.name} {`);
          lines.push(
            ...formatNested(
              firstItem as Record<string, unknown>,
              indentLevel + 1,
            ),
          );
          lines.push(`${indent}}`);
          return;
        }
      }

      if (
        typeof fieldValue === "object" &&
        fieldValue !== null &&
        !Array.isArray(fieldValue)
      ) {
        lines.push(`${indent}${field.name} {`);
        lines.push(
          ...formatNested(
            fieldValue as Record<string, unknown>,
            indentLevel + 1,
          ),
        );
        lines.push(`${indent}}`);
        return;
      }
    }

    lines.push(`${indent}${field.name}`);
  });

  return lines;
}

function buildGetQuery(
  schemaName: string,
  fields: TemplateField[],
  previewData: Record<string, unknown>,
  pageNo: number,
  pageSize: number,
  filter?: string,
  projectionFields?: string[],
  sortBy?: string,
  sortDescending?: boolean,
): string {
  let selectedFields = fields;
  if (projectionFields && projectionFields.length > 0) {
    const filtered = fields.filter((f) => projectionFields.includes(f.name));
    if (filtered.length > 0) selectedFields = filtered;
  }

  const selectionLines = buildSelectionFields(selectedFields, previewData);

  const lines = [
    "query {",
    `  get${schemaName}s(`,
    "    input: {",
    `      pageNo: ${pageNo}`,
    `      pageSize: ${pageSize}`,
  ];

  if (filter && filter.trim()) {
    lines.push(`      filter: "${filter.replace(/"/g, '\\"')}"`);
  }
  if (sortBy) {
    const sortObj = JSON.stringify({ [sortBy]: sortDescending ? -1 : 1 });
    lines.push(`      sort: "${sortObj.replace(/"/g, '\\"')}"`);
  }

  lines.push(
    "    }",
    "  ) {",
    "    totalCount",
    "    items {",
    ...selectionLines,
    "    }",
    "  }",
    "}",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Loading / Empty / Error states
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[calc(100vh-608px)] flex-col items-center justify-center text-center py-4">
      <p className="text-sm font-medium text-foreground">No data found</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This schema has no records yet.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-destructive">
        Failed to fetch data
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

const VIEW_TOGGLES: { mode: ViewMode; icon: ReactNode; label: string }[] = [
  { mode: "table", icon: <Table2 className="h-4 w-4" />, label: "Table view" },
  { mode: "json", icon: <Braces className="h-4 w-4" />, label: "JSON view" },
  { mode: "list", icon: <List className="h-4 w-4" />, label: "List view" },
];

// ---------------------------------------------------------------------------
// SchemaDataTab
// ---------------------------------------------------------------------------

export function SchemaDataTab({
  schemaName,
  fields,
  previewData,
}: SchemaDataTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [totalCount, setTotalCount] = useState(0);

  const fieldNames = fields.map((f) => f.name);
  const piiFields = useMemo(
    () => new Set(fields.filter((f) => f.isPIIData).map((f) => f.name)),
    [fields],
  );

  const [appliedQueryFilter, setAppliedQueryFilter] = useState("");
  const [appliedProjectionFields, setAppliedProjectionFields] = useState<
    string[]
  >([]);
  const [appliedSortField, setAppliedSortField] = useState("");
  const [appliedSortDirection, setAppliedSortDirection] = useState<
    "asc" | "desc"
  >("asc");

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const { mutateAsync: executeGraphQL } = useExecuteGraphQL();
  const selectedProject = useProjectStore().selectedProject;
  const projectShortKey = selectedProject?.tenantSlug || "";

  const fetchData = async (
    page = pageNo,
    size = pageSize,
    filter = appliedQueryFilter,
    projectionFields = appliedProjectionFields,
    sortBy = appliedSortField,
    sortDescending = appliedSortDirection === "desc",
  ) => {
    if (!schemaName) return;
    setIsLoading(true);
    setError(null);

    try {
      const query = buildGetQuery(
        schemaName,
        fields,
        previewData,
        page,
        size,
        filter || undefined,
        projectionFields.length ? projectionFields : undefined,
        sortBy || undefined,
        sortBy ? sortDescending : undefined,
      );
      const response = await executeGraphQL({ projectShortKey, query });

      const queryKey = `get${schemaName}s`;
      const responseData = (response as Record<string, unknown> | null)
        ?.data as Record<string, unknown> | undefined;
      const queryResult = responseData?.[queryKey] as
        | Record<string, unknown>
        | undefined;
      const items = queryResult?.items;
      const count = (queryResult?.totalCount as number) ?? 0;

      setData(Array.isArray(items) ? (items as Record<string, unknown>[]) : []);
      setTotalCount(count);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        setError("Please check the server status");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Reset and fetch on schema change
  useEffect(() => {
    setPageNo(1);
    setAppliedQueryFilter("");
    setAppliedProjectionFields([]);
    setAppliedSortField("");
    setAppliedSortDirection("asc");
    fetchData(1, pageSize, "", [], "", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaName]);

  const handlePageChange = (nextPage: number) => {
    setPageNo(nextPage);
    fetchData(nextPage, pageSize);
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = Number(value);
    setPageSize(newSize);
    setPageNo(1);
    fetchData(1, newSize);
  };

  const handleApplyProjection = (fields: string[]) => {
    setAppliedProjectionFields(fields);
    setPageNo(1);
    fetchData(
      1,
      pageSize,
      appliedQueryFilter,
      fields,
      appliedSortField,
      appliedSortDirection === "desc",
    );
  };

  const handleApplySort = (field: string, direction: "asc" | "desc") => {
    setAppliedSortField(field);
    setAppliedSortDirection(direction);
    setPageNo(1);
    fetchData(
      1,
      pageSize,
      appliedQueryFilter,
      appliedProjectionFields,
      field || undefined,
      direction === "desc",
    );
  };

  const handleResetAll = () => {
    setAppliedQueryFilter("");
    setAppliedProjectionFields([]);
    setAppliedSortField("");
    setAppliedSortDirection("asc");
    setPageNo(1);
    fetchData(1, pageSize, "", [], "", false);
  };

  const isAnyFilterActive = !!(
    appliedQueryFilter ||
    appliedProjectionFields.length > 0 ||
    appliedSortField
  );

  const showContent = !isLoading && !error && data !== null;
  const hasData = showContent && data.length > 0;
  const showPagination =
    !isLoading && !error && data !== null && totalCount > 0;

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        {/* Left group: filter + project + sort + reset */}
        <div className="flex items-center gap-1">
          <FilterPopover
            fields={fields}
            appliedFilter={appliedQueryFilter}
            onApply={(filter) => {
              setAppliedQueryFilter(filter);
              setPageNo(1);
              fetchData(
                1,
                pageSize,
                filter,
                appliedProjectionFields,
                appliedSortField,
                appliedSortDirection === "desc",
              );
            }}
          />
          <ProjectionPopover
            fieldNames={fieldNames}
            appliedFields={appliedProjectionFields}
            onApply={handleApplyProjection}
          />
          <SortPopover
            fieldNames={fieldNames}
            appliedSortField={appliedSortField}
            appliedSortDirection={appliedSortDirection}
            onApply={handleApplySort}
            onClear={handleResetAll}
          />
          <ResetButton isActive={isAnyFilterActive} onReset={handleResetAll} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right group: refresh + view toggles */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => fetchData(pageNo)}
            disabled={isLoading}
            title="Refresh data"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>

          <div className="flex items-center rounded-md border border-border bg-muted p-0.5">
            {VIEW_TOGGLES.map(({ mode, icon, label }) => (
              <button
                key={mode}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => setViewMode(mode)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  viewMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className={`min-h-0 flex-1 overflow-hidden ${viewMode !== "table" ? "overflow-y-auto overflow-x-hidden" : ""}`}
      >
        <div className={viewMode === "table" ? "h-full" : "pb-1"}>
          {isLoading && <LoadingSkeleton />}
          {!isLoading && error && <ErrorState message={error} />}
          {showContent && !hasData && <EmptyState />}
          {hasData && viewMode === "list" && (
            <DataListView data={data} piiFields={piiFields} />
          )}
          {hasData && viewMode === "json" && (
            <DataJsonView data={data} piiFields={piiFields} />
          )}
          {hasData && viewMode === "table" && (
            <DataTableView data={data} piiFields={piiFields} />
          )}
        </div>
      </div>

      {/* Pagination */}
      {showPagination && (
        <DataPagination
          pageNo={pageNo}
          pageSize={pageSize}
          totalPages={totalPages}
          isLoading={isLoading}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
