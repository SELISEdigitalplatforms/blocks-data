"use client";

import { useEffect, useMemo, useState } from "react";

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
  GraphLogOperationType,
  GraphLogResponseStatus,
  IGraphLogHistoryItem,
  failureKindLabel,
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
  const [responseStatus, setResponseStatus] = useState<GraphLogResponseStatus | typeof ALL>(ALL);
  const [failureKind, setFailureKind] = useState<GraphLogFailureKind | typeof ALL>(ALL);
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
    responseStatus: responseStatus === ALL ? undefined : responseStatus,
    failureKind: failureKind === ALL ? undefined : failureKind,
  });

  useEffect(() => {
    if (isError) {
      showErrorToast({
        title: "Couldn't load request history",
        errors: [error instanceof Error ? error.message : "Something went wrong. Please try again."],
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
                value={responseStatus}
                onValueChange={(value) => {
                  setResponseStatus(value as GraphLogResponseStatus | typeof ALL);
                  setPageNo(1);
                }}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Response status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
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
                  <TableHead>Time</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Source</TableHead>
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
                  items.map((item) => (
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
                      <TableCell className="font-medium">{item.schemaName || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.operationType || "—"}
                      </TableCell>
                      <TableCell title={item.failureMessage || undefined}>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={item.responseStatus === "failed" ? "error" : "success"}>
                            {item.responseStatus || "unknown"}
                          </Badge>
                          {item.responseStatus === "failed" && (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {failureKindLabel(item.failureKind || "unknown")}
                            </span>
                          )}
                        </div>
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
                  ))
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
