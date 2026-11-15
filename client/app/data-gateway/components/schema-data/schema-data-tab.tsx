"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Braces, List, RefreshCw, Table2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui-kits/alert/alert";
import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useExecuteGraphQL } from "@/data-gateway/hooks/use-configuration";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { HttpError } from "@/lib/http-client";
import {
  buildResolvedSelectionLines,
  parseFieldDoesNotExistErrors,
  resolveDataTabSelection,
  type DataTabField,
  type DataTabSelection,
  type FieldDoesNotExistError,
} from "@/data-gateway/utils/data-tab-selection";
import { DataListView } from "./data-list-view";
import { DataJsonView } from "./data-json-view";
import { DataTableView } from "./data-table-view";
import { FilterPopover } from "./toolbar/filter-popover";
import { ProjectionPopover } from "./toolbar/projection-popover";
import { SortPopover } from "./toolbar/sort-popover";
import { ResetButton } from "./toolbar/reset-button";
import { DataPagination } from "./toolbar/data-pagination";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

type ViewMode = "list" | "json" | "table";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200] as const;

/**
 * How long the first query waits for the gateway introspection. After that the
 * tab stops waiting and queries from the form fields, as it did before it waited
 * at all, so a hung introspection request never leaves it on the skeleton.
 */
export const INTROSPECTION_WAIT_MS = 15_000;

/** The gateway's query root name, used to read its errors when introspection is unavailable. */
const DEFAULT_QUERY_TYPE_NAME = "Query";

type TemplateField = DataTabField;

interface SchemaDataTabProps {
  schemaName: string;
  fields: TemplateField[];
  /** Used to build the selection only while the live gateway type is unknown. */
  previewData: Record<string, unknown>;
  /** The project's gateway introspection; undefined keeps the query built from the form. */
  rawIntrospection?: unknown;
  /** True while introspection has no data yet and a fetch is running. */
  introspectionPending?: boolean;
}

type TabError =
  | { kind: "message"; message: string }
  | { kind: "missing-fields"; fields: FieldDoesNotExistError[]; raw: string }
  | { kind: "not-live"; raw: string };

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
        nestedLines.push(
          `${nestedIndent}${key} {`,
          ...formatNested(val[0] as Record<string, unknown>, level + 1),
          `${nestedIndent}}`,
        );
      } else if (
        typeof val === "object" &&
        val !== null &&
        !Array.isArray(val)
      ) {
        nestedLines.push(
          `${nestedIndent}${key} {`,
          ...formatNested(val as Record<string, unknown>, level + 1),
          `${nestedIndent}}`,
        );
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
          lines.push(
            `${indent}${field.name} {`,
            ...formatNested(
              firstItem as Record<string, unknown>,
              indentLevel + 1,
            ),
            `${indent}}`,
          );
          return;
        }
      }

      if (
        typeof fieldValue === "object" &&
        fieldValue !== null &&
        !Array.isArray(fieldValue)
      ) {
        lines.push(
          `${indent}${field.name} {`,
          ...formatNested(
            fieldValue as Record<string, unknown>,
            indentLevel + 1,
          ),
          `${indent}}`,
        );
        return;
      }
    }

    lines.push(`${indent}${field.name}`);
  });

  return lines;
}

/** The selection built from the form fields and preview data, used while the live type is unknown. */
function buildFormSelectionLines(
  fields: TemplateField[],
  previewData: Record<string, unknown>,
  projectionFields?: string[],
): string[] {
  let selectedFields = fields;
  if (projectionFields && projectionFields.length > 0) {
    const filtered = fields.filter((f) => projectionFields.includes(f.name));
    if (filtered.length > 0) selectedFields = filtered;
  }
  return buildSelectionFields(selectedFields, previewData);
}

function buildSelectionLines(
  selection: DataTabSelection,
  fields: TemplateField[],
  previewData: Record<string, unknown>,
  projectionFields?: string[],
): string[] {
  return selection.status === "resolved"
    ? buildResolvedSelectionLines(selection, projectionFields)
    : buildFormSelectionLines(fields, previewData, projectionFields);
}

function safeResolveSelection(
  rawIntrospection: unknown,
  schemaName: string,
  fields: TemplateField[],
): DataTabSelection {
  try {
    return resolveDataTabSelection({ rawIntrospection, schemaName, fields });
  } catch (resolveError) {
    // The helper is written not to throw; if it ever does, keep the form-built query.
    console.error(resolveError);
    return { status: "unresolved" };
  }
}

function buildGetQuery(
  schemaName: string,
  selectionLines: string[],
  pageNo: number,
  pageSize: number,
  filter?: string,
  sortBy?: string,
  sortDescending?: boolean,
): string {
  const lines = [
    "query {",
    `  get${schemaName}s(`,
    "    input: {",
    `      pageNo: ${pageNo}`,
    `      pageSize: ${pageSize}`,
  ];

  if (filter?.trim()) {
    lines.push(`      filter: "${filter.replaceAll('"', String.raw`\"`)}"`);
  }
  if (sortBy) {
    const sortObj = JSON.stringify({ [sortBy]: sortDescending ? -1 : 1 });
    lines.push(`      sort: "${sortObj.replaceAll('"', String.raw`\"`)}"`);
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
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  return (
    <div className="flex h-[calc(100vh-608px)] flex-col items-center justify-center text-center py-4">
      <p className="text-sm font-medium text-foreground">{t("common:NO_DATA")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("SCHEMA_DATA_TAB.THIS_SCHEMA_HAS_NO_RECORDS_YET")}
      </p>
    </div>
  );
}

function FieldNameList({ names }: Readonly<{ names: string[] }>) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {names.map((name) => (
        <li key={name} className="break-all font-mono">
          {name}
        </li>
      ))}
    </ul>
  );
}

/** Lists the form fields the live gateway type doesn't have; rows still render below it. */
function DriftNotice({ missingFields }: Readonly<{ missingFields: string[] }>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  return (
    <Alert
      variant="warning"
      role="status"
      className="shrink-0 rounded-sm px-3 py-2.5 text-xs"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none font-semibold">
        {t("SCHEMA_DATA_TAB.SOME_FIELDS_AREN_T_IN_THE_LIVE")}
      </AlertTitle>
      <AlertDescription className="text-xs text-warning-800">
        <p>{t("SCHEMA_DATA_TAB.THEY_RE_LEFT_OUT_OF_THE")}</p>
        <FieldNameList names={missingFields} />
      </AlertDescription>
    </Alert>
  );
}

/** The raw gateway error, collapsed behind a toggle and rendered as text only. */
function ErrorDetails({ raw }: Readonly<{ raw: string }>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  return (
    <div className="mt-2 flex w-full flex-col items-center gap-1">
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-xs"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen
          ? t("SCHEMA_DATA_TAB.HIDE_DETAILS")
          : t("SCHEMA_DATA_TAB.SHOW_DETAILS")}
      </Button>
      <pre
        id={detailsId}
        hidden={!isOpen}
        className="w-full whitespace-pre-wrap break-all rounded-sm border border-border bg-muted p-2 text-left text-xs text-muted-foreground"
      >
        {raw}
      </pre>
    </div>
  );
}

function ErrorMessage({ error }: Readonly<{ error: TabError }>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  if (error.kind === "message") {
    return <p className="mt-1 max-w-xs text-xs text-muted-foreground">{error.message}</p>;
  }
  if (error.kind === "not-live") {
    return (
      <>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {t("SCHEMA_DATA_TAB.THIS_SCHEMA_ISN_T_IN_THE")}
        </p>
        <ErrorDetails raw={error.raw} />
      </>
    );
  }
  return (
    <>
      <div className="mt-1 flex max-w-md flex-col items-center gap-1 text-xs text-muted-foreground">
        <p>{t("SCHEMA_DATA_TAB.THE_LIVE_VERSION_DOESN_T_HAVE")}</p>
        <FieldNameList
          names={error.fields.map(({ field, type }) =>
            t("SCHEMA_DATA_TAB.FIELD_ON_TYPE", { field, type }),
          )}
        />
        <p>{t("SCHEMA_DATA_TAB.PUBLISH_THE_SCHEMA_THEN_REFRESH")}</p>
      </div>
      <ErrorDetails raw={error.raw} />
    </>
  );
}

function ErrorState({ error }: Readonly<{ error: TabError }>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-destructive">
        {t("SCHEMA_DATA_TAB.FAILED_TO_FETCH_DATA")}
      </p>
      <ErrorMessage error={error} />
    </div>
  );
}

const VIEW_TOGGLES: { mode: ViewMode; icon: ReactNode; label: string }[] = [
  { mode: "table", icon: <Table2 className="h-4 w-4" />, get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_DATA_TAB.TABLE_VIEW"); } },
  { mode: "json", icon: <Braces className="h-4 w-4" />, get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_DATA_TAB.JSON_VIEW"); } },
  { mode: "list", icon: <List className="h-4 w-4" />, get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_DATA_TAB.LIST_VIEW"); } },
];

// ---------------------------------------------------------------------------
// SchemaDataTab
// ---------------------------------------------------------------------------

export function SchemaDataTab({
  schemaName,
  fields,
  previewData,
  rawIntrospection,
  introspectionPending = false,
}: Readonly<SchemaDataTabProps>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<TabError | null>(null);
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

  // Which form fields the live gateway type has. Only the emitted selection text
  // (the key) decides whether a new query is needed, never object identity.
  const selection = useMemo(
    () => safeResolveSelection(rawIntrospection, schemaName, fields),
    [rawIntrospection, schemaName, fields],
  );
  const selectionKey = useMemo(
    () => buildSelectionLines(selection, fields, previewData).join("\n"),
    [selection, fields, previewData],
  );
  const queryTypeName =
    selection.status === "unresolved" ? DEFAULT_QUERY_TYPE_NAME : selection.queryTypeName;

  // The first query waits for introspection, at most INTROSPECTION_WAIT_MS per schema.
  const [waitExpiredFor, setWaitExpiredFor] = useState<string | null>(null);
  const isWaitingForIntrospection = introspectionPending && waitExpiredFor !== schemaName;

  useEffect(() => {
    if (!isWaitingForIntrospection) return;
    const timer = setTimeout(() => setWaitExpiredFor(schemaName), INTROSPECTION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForIntrospection, schemaName]);

  // Only the newest request may update the tab, and nothing updates it after unmount.
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const toTabError = (err: unknown): TabError => {
    if (err instanceof HttpError) {
      if (err.status === 404) {
        return { kind: "message", message: t("SCHEMA_DATA_TAB.PLEASE_CHECK_THE_SERVER_STATUS") };
      }
      // The gateway's errors array; `HttpError.message` is its JSON text.
      const fieldErrors = parseFieldDoesNotExistErrors(err.errors);
      if (fieldErrors) {
        const [first] = fieldErrors;
        const isListFieldMissing =
          fieldErrors.length === 1 &&
          first.field === `get${schemaName}s` &&
          first.type === queryTypeName;
        return isListFieldMissing
          ? { kind: "not-live", raw: err.message }
          : { kind: "missing-fields", fields: fieldErrors, raw: err.message };
      }
    }
    return { kind: "message", message: err instanceof Error ? err.message : String(err) };
  };

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
    // While the first query waits for introspection, the change is kept in state
    // and goes out with that query.
    if (isWaitingForIntrospection) return;
    await runQuery(page, size, filter, projectionFields, sortBy, sortDescending);
  };

  /** The request half of fetchData; callers set the loading/error flags first. */
  const runQuery = async (
    page: number,
    size: number,
    filter: string,
    projectionFields: string[],
    sortBy: string,
    sortDescending: boolean,
  ) => {
    if (!schemaName) return;
    requestSeqRef.current += 1;
    const requestSeq = requestSeqRef.current;
    const isCurrent = () => isMountedRef.current && requestSeq === requestSeqRef.current;
    try {
      const query = buildGetQuery(
        schemaName,
        buildSelectionLines(
          selection,
          fields,
          previewData,
          projectionFields.length ? projectionFields : undefined,
        ),
        page,
        size,
        filter || undefined,
        sortBy || undefined,
        sortBy ? sortDescending : undefined,
      );
      const response = await executeGraphQL({ projectShortKey, query });
      if (!isCurrent()) return;

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
      if (isCurrent()) setError(toTabError(err));
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  };

  // Reset the applied query on schema change (during render, so the new schema never renders
  // with the old filters), then fetch its first page.
  const [prevSchemaName, setPrevSchemaName] = useState<typeof schemaName | null>(null);
  if (schemaName !== prevSchemaName) {
    setPrevSchemaName(schemaName);
    setPageNo(1);
    setAppliedQueryFilter("");
    setAppliedProjectionFields([]);
    setAppliedSortField("");
    setAppliedSortDirection("asc");
    setWaitExpiredFor(null);
    if (schemaName) {
      setIsLoading(true);
      setError(null);
    }
  }

  // Automatic queries: the schema's first page once introspection has settled (or
  // the wait expired), then one re-query whenever the computed selection changes,
  // for example after a publish re-seeds introspection. User actions query on
  // their own; a parent re-render with an equal selection queries nothing.
  const lastAutoQueryRef = useRef<{ schemaName: string; selectionKey: string } | null>(null);
  useEffect(() => {
    if (!schemaName || isWaitingForIntrospection) return;
    const last = lastAutoQueryRef.current;
    if (last?.schemaName === schemaName && last.selectionKey === selectionKey) return;
    lastAutoQueryRef.current = { schemaName, selectionKey };
    const sortDescending = appliedSortDirection === "desc";
    if (last?.schemaName === schemaName) {
      fetchData(pageNo, pageSize, appliedQueryFilter, appliedProjectionFields, appliedSortField, sortDescending);
    } else {
      // The schema-change reset above already shows the skeleton.
      runQuery(pageNo, pageSize, appliedQueryFilter, appliedProjectionFields, appliedSortField, sortDescending);
    }
    // Only these three decide when an automatic query goes out; the paging, filter,
    // projection and sort it carries are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaName, isWaitingForIntrospection, selectionKey]);

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

  const missingFields =
    selection.status === "resolved" && !isWaitingForIntrospection && !error
      ? selection.missingFields
      : [];

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
            title={t("SCHEMA_DATA_TAB.REFRESH_DATA")}
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
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {missingFields.length > 0 && <DriftNotice missingFields={missingFields} />}

      {/* Scrollable content */}
      <div
        className={`min-h-0 flex-1 overflow-hidden ${viewMode === "table" ? "" : "overflow-y-auto overflow-x-hidden"}`}
      >
        <div className={viewMode === "table" ? "h-full" : "pb-1"}>
          {isLoading && <LoadingSkeleton />}
          {!isLoading && error && <ErrorState error={error} />}
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
          totalCount={totalCount}
          isLoading={isLoading}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
