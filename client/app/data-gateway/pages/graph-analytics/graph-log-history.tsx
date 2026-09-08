"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Card, CardContent } from "@/components/ui-kits/card/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { Pagination } from "@/data-gateway/components/shared/pagination";
import { showErrorToast } from "@/hooks/use-toast";
import { useGraphLogHistory } from "../../hooks/use-graph-log-history";
import {
  FAILURE_KIND_LABELS,
  GraphLogFailureKind,
  GraphLogHistorySort,
  GraphLogOperationType,
  GraphLogOutcome,
  IGraphLogHistoryItem,
  graphLogOutcome,
} from "../../models/graph-log-history";
import { GraphLogDetailsSheet } from "./graph-log-details-sheet";
import {
  formatDateTime,
  formatDateTimeWithSeconds,
  formatDuration,
  formatRelativeTime,
  formatSize,
} from "./graph-log-formatters";

const ALL = "all";
const STATUS_CODES = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];

const outcomeVariant = (outcome: GraphLogOutcome) =>
  outcome === "allowed" ? "success" : outcome === "denied" ? "info" : "error";

const SortableTableHead = ({
  field,
  label,
  activeField,
  descending,
  onSort,
}: {
  field: GraphLogHistorySort;
  label: string;
  activeField: GraphLogHistorySort;
  descending: boolean;
  onSort: (field: GraphLogHistorySort) => void;
}) => {
  const active = field === activeField;
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <TableHead aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className="group inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:text-foreground"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon
          className={`h-3.5 w-3.5 ${active ? "opacity-80" : "opacity-30 group-hover:opacity-70"}`}
        />
      </button>
    </TableHead>
  );
};

/** 2xx reads as normal; 4xx/5xx are worth spotting while scanning the column. */
const statusCodeClass = (statusCode: number) =>
  statusCode >= 400 ? "text-destructive" : "text-muted-foreground";

interface GraphLogHistoryProps {
  /** Same range the analytics tab uses, as ISO calendar dates. */
  from?: string;
  to?: string;
}

export const GraphLogHistory = ({ from, to }: GraphLogHistoryProps) => {
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [operationType, setOperationType] = useState<GraphLogOperationType | typeof ALL>(ALL);
  const [outcome, setOutcome] = useState<GraphLogOutcome | typeof ALL>(ALL);
  const [statusCode, setStatusCode] = useState<typeof ALL | string>(ALL);
  const [failureKind, setFailureKind] = useState<GraphLogFailureKind | typeof ALL>(ALL);
  const [sortBy, setSortBy] = useState<GraphLogHistorySort>("time");
  const [sortDescending, setSortDescending] = useState(true);
  const [selectedItem, setSelectedItem] = useState<IGraphLogHistoryItem | null>(null);

  // A new date range invalidates the current page number. Adjusting during render (rather than in
  // an effect) avoids a throwaway fetch for a page that no longer exists.
  const rangeKey = `${from}|${to}`;
  const [lastRangeKey, setLastRangeKey] = useState(rangeKey);
  if (rangeKey !== lastRangeKey) {
    setLastRangeKey(rangeKey);
    setPageNo(1);
  }

  const { data, isLoading, isFetching, isError, error } = useGraphLogHistory({
    from,
    to,
    pageNo,
    pageSize,
    operationType: operationType === ALL ? undefined : operationType,
    outcome: outcome === ALL ? undefined : outcome,
    statusCode: statusCode === ALL ? undefined : Number(statusCode),
    failureKind: failureKind === ALL ? undefined : failureKind,
    sortBy,
    sortDescending,
  });

  const handleSort = (field: GraphLogHistorySort) => {
    if (field === sortBy) {
      setSortDescending((current) => !current);
    } else {
      setSortBy(field);
      setSortDescending(false);
    }
    setPageNo(1);
  };

  useEffect(() => {
    if (isError) {
      showErrorToast({
        title: "Couldn't load request history",
        errors: [
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
        ],
      });
    }
  }, [isError, error]);

  const items = useMemo(() => data?.data?.items ?? [], [data?.data?.items]);
  const totalCount = data?.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <span className="text-sm text-muted-foreground">
              {totalCount} {totalCount === 1 ? "request" : "requests"}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={operationType}
                onValueChange={(value) => {
                  setOperationType(value as GraphLogOperationType | typeof ALL);
                  setPageNo(1);
                }}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Operation type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  <SelectItem value="query">Query</SelectItem>
                  <SelectItem value="mutation">Mutation</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={outcome}
                onValueChange={(value) => {
                  setOutcome(value as GraphLogOutcome | typeof ALL);
                  setPageNo(1);
                }}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Response status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusCode}
                onValueChange={(value) => {
                  setStatusCode(value);
                  setPageNo(1);
                }}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Status code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All codes</SelectItem>
                  {STATUS_CODES.map((code) => (
                    <SelectItem key={code} value={String(code)}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={failureKind}
                onValueChange={(value) => {
                  setFailureKind(value as GraphLogFailureKind | typeof ALL);
                  setPageNo(1);
                }}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Failure reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All reasons</SelectItem>
                  {Object.entries(FAILURE_KIND_LABELS).map(([kind, label]) => (
                    <SelectItem key={kind} value={kind}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <SpinnerLoader />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["time", "Time"],
                      ["schema", "Schema"],
                      ["type", "Type"],
                      ["status", "Status"],
                      ["code", "Code"],
                      ["duration", "Duration"],
                      ["size", "Size"],
                      ["source", "Source"],
                    ] as const
                  ).map(([field, label]) => (
                    <SortableTableHead
                      key={field}
                      field={field}
                      label={label}
                      activeField={sortBy}
                      descending={sortDescending}
                      onSort={handleSort}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {isError
                        ? "Couldn't load data. Please try again."
                        : "No requests in this range."}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const itemOutcome = graphLogOutcome(item);
                    return (
                      <TableRow
                        key={`${item.traceId}-${item.spanId}`}
                        className="cursor-pointer"
                        onClick={() => setSelectedItem(item)}
                      >
                        <TableCell
                          className="whitespace-nowrap"
                          title={formatDateTimeWithSeconds(item.timestamp)}
                        >
                          <div className="flex flex-col">
                            <span>{formatDateTime(item.timestamp)}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(item.timestamp)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.schemaName ||
                            (item.isIntrospection ? (
                              <span className="italic text-muted-foreground">introspection</span>
                            ) : (
                              "—"
                            ))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.operationType || "—"}
                        </TableCell>
                        {/* Just the outcome here — the reason remains available in row details. */}
                        <TableCell title={item.failureMessage || undefined}>
                          <Badge
                            className="w-[108px] capitalize"
                            variant={outcomeVariant(itemOutcome)}
                          >
                            {itemOutcome}
                          </Badge>
                        </TableCell>
                        <TableCell className={statusCodeClass(item.statusCode)}>
                          {item.statusCode || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDuration(item.duration)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatSize(item.responseSize)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.inAppRequest ? "In-app" : "External"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}

          <Pagination
            pageNo={pageNo}
            pageSize={pageSize}
            totalPages={totalPages}
            isLoading={isFetching}
            onPageChange={setPageNo}
            onPageSizeChange={(value) => {
              setPageSize(Number(value));
              setPageNo(1);
            }}
          />
        </CardContent>
      </Card>

      <GraphLogDetailsSheet
        item={selectedItem}
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      />
    </>
  );
};
