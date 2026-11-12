"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, History } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
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
  GraphLogTransport,
  IGraphLogHistoryItem,
  graphLogOutcome,
} from "../../models/graph-log-history";
import { AnalyticsCard } from "./analytics-card";
import { GraphLogDetailsSheet } from "./graph-log-details-sheet";
import {
  formatDateTime,
  formatDateTimeWithSeconds,
  formatDuration,
  formatRelativeTime,
  formatSize,
} from "./graph-log-formatters";
import { useT } from "@seliseblocks/genesis-os/i18n";

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
  const { t } = useT("data.gateway.analytics");
  const active = field === activeField;
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <TableHead aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className="group inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:text-foreground"
        onClick={() => onSort(field)}
        aria-label={t("GRAPH_LOG_HISTORY.SORT_BY_LABEL", { label })}
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
  /** Viewer offset from UTC in minutes; UTC+06:00 is 360. */
  utcOffsetMinutes?: number;
  includeBlocksConsole?: boolean;
}

export const GraphLogHistory = ({
  from,
  to,
  utcOffsetMinutes = -new Date().getTimezoneOffset(),
  includeBlocksConsole = false,
}: GraphLogHistoryProps) => {
  const { t } = useT("data.gateway.analytics");
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [operationType, setOperationType] = useState<GraphLogOperationType | typeof ALL>(ALL);
  const [transport, setTransport] = useState<GraphLogTransport | typeof ALL>(ALL);
  const [outcome, setOutcome] = useState<GraphLogOutcome | typeof ALL>(ALL);
  const [statusCode, setStatusCode] = useState<typeof ALL | string>(ALL);
  const [failureKind, setFailureKind] = useState<GraphLogFailureKind | typeof ALL>(ALL);
  const [sortBy, setSortBy] = useState<GraphLogHistorySort>("time");
  const [sortDescending, setSortDescending] = useState(true);
  const [selectedItem, setSelectedItem] = useState<IGraphLogHistoryItem | null>(null);

  // A new date range invalidates the current page number. Adjusting during render (rather than in
  // an effect) avoids a throwaway fetch for a page that no longer exists.
  const rangeKey = `${from}|${to}|${includeBlocksConsole}`;
  const [lastRangeKey, setLastRangeKey] = useState(rangeKey);
  if (rangeKey !== lastRangeKey) {
    setLastRangeKey(rangeKey);
    setPageNo(1);
  }

  const { data, isLoading, isFetching, isError, error } = useGraphLogHistory({
    from,
    to,
    utcOffsetMinutes,
    pageNo,
    pageSize,
    operationType: operationType === ALL ? undefined : operationType,
    transport: transport === ALL ? undefined : transport,
    outcome: outcome === ALL ? undefined : outcome,
    statusCode: statusCode === ALL ? undefined : Number(statusCode),
    failureKind: failureKind === ALL ? undefined : failureKind,
    includeBlocksConsole,
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
        title: t("GRAPH_LOG_HISTORY.COULDN_T_LOAD_REQUEST_HISTORY"),
        errors: [
          error instanceof Error ? error.message : t("GRAPH_LOG_HISTORY.SOMETHING_WENT_WRONG_PLEASE_TRY_AGAIN"),
        ],
      });
    }
  }, [isError, error, t]);

  const items = useMemo(() => data?.data?.items ?? [], [data?.data?.items]);
  const totalCount = data?.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <AnalyticsCard icon={History} title={t("GRAPH_LOG_HISTORY.REQUEST_LOG")} contentClassName="flex flex-col gap-4 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <span className="text-sm text-muted-foreground">
            {t("GRAPH_LOG_HISTORY.REQUEST_COUNT", { count: totalCount })}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={operationType}
              onValueChange={(value) => {
                setOperationType(value as GraphLogOperationType | typeof ALL);
                setPageNo(1);
              }}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={t("GRAPH_LOG_HISTORY.OPERATION_TYPE")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("GRAPH_LOG_HISTORY.ALL_TYPES")}</SelectItem>
                <SelectItem value="query">{t("GRAPH_LOG_HISTORY.QUERY")}</SelectItem>
                <SelectItem value="mutation">{t("GRAPH_LOG_HISTORY.MUTATION")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={transport}
              onValueChange={(value) => {
                setTransport(value as GraphLogTransport | typeof ALL);
                setPageNo(1);
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs" aria-label={t("GRAPH_LOG_HISTORY.TRANSPORT")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("GRAPH_LOG_HISTORY.ALL_TRANSPORTS")}</SelectItem>
                <SelectItem value="rest">{t("GRAPH_LOG_HISTORY.REST")}</SelectItem>
                <SelectItem value="graphql">{t("GRAPH_LOG_HISTORY.GRAPHQL")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={outcome}
              onValueChange={(value) => {
                setOutcome(value as GraphLogOutcome | typeof ALL);
                setPageNo(1);
              }}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={t("GRAPH_LOG_HISTORY.RESPONSE_STATUS")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("GRAPH_LOG_HISTORY.ALL_STATUSES")}</SelectItem>
                <SelectItem value="allowed">{t("GRAPH_LOG_HISTORY.ALLOWED")}</SelectItem>
                <SelectItem value="denied">{t("GRAPH_LOG_HISTORY.DENIED")}</SelectItem>
                <SelectItem value="error">{t("common:ERROR")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusCode}
              onValueChange={(value) => {
                setStatusCode(value);
                setPageNo(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label={t("GRAPH_LOG_HISTORY.STATUS_CODE")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("GRAPH_LOG_HISTORY.ALL_CODES")}</SelectItem>
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
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={t("GRAPH_LOG_HISTORY.FAILURE_REASON")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("GRAPH_LOG_HISTORY.ALL_REASONS")}</SelectItem>
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
                    ["time", t("GRAPH_LOG_HISTORY.TIME")],
                    ["schema", t("GRAPH_LOG_HISTORY.SCHEMA")],
                    ["type", t("common:TYPE")],
                    ["status", t("common:STATUS")],
                    ["code", t("GRAPH_LOG_HISTORY.CODE")],
                    ["duration", t("GRAPH_LOG_HISTORY.DURATION")],
                    ["size", t("GRAPH_LOG_HISTORY.SIZE")],
                    ["source", t("GRAPH_LOG_HISTORY.SOURCE")],
                  ] as const
                ).map(([field, label]) => (
                  <Fragment key={field}>
                    <SortableTableHead
                      field={field}
                      label={label}
                      activeField={sortBy}
                      descending={sortDescending}
                      onSort={handleSort}
                    />
                    {/* The server has no transport sort, so this column is a plain header. */}
                    {field === "type" && <TableHead>{t("GRAPH_LOG_HISTORY.TRANSPORT")}</TableHead>}
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {isError
                      ? t("GRAPH_LOG_HISTORY.COULDN_T_LOAD_DATA_PLEASE_TRY")
                      : t("GRAPH_LOG_HISTORY.NO_REQUESTS_IN_THIS_RANGE")}
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
                            <span className="italic text-muted-foreground">{t("GRAPH_LOG_HISTORY.INTROSPECTION")}</span>
                          ) : (
                            "—"
                          ))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.operationType || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {item.transport === "rest"
                            ? t("GRAPH_LOG_HISTORY.REST")
                            : t("GRAPH_LOG_HISTORY.GRAPHQL")}
                        </Badge>
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
                        {item.inAppRequest ? t("GRAPH_LOG_HISTORY.IN_APP") : t("GRAPH_LOG_HISTORY.BLOCKS_CONSOLE")}
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
          totalCount={totalCount}
          isLoading={isFetching}
          onPageChange={setPageNo}
          onPageSizeChange={(value) => {
            setPageSize(Number(value));
            setPageNo(1);
          }}
        />
      </AnalyticsCard>

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
