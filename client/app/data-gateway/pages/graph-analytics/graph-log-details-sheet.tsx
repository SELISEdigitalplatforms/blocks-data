"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui-kits/sheet/sheet";
import {
  IGraphLogHistoryItem,
  failureKindLabel,
  graphLogOutcome,
} from "../../models/graph-log-history";
import { PhaseBreakdown, toPhaseRows } from "./graph-phase-breakdown";
import {
  formatDateTimeWithSeconds,
  formatDuration,
  formatRelativeTime,
  formatSize,
} from "./graph-log-formatters";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface GraphLogDetailsSheetProps {
  item: IGraphLogHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
    <span className="break-all text-sm text-foreground">{value}</span>
  </div>
);

const CodeBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
    <pre className="max-h-72 overflow-auto rounded-sm border border-border/40 bg-muted/40 p-3 text-xs leading-relaxed">
      {value}
    </pre>
  </div>
);

export const GraphLogDetailsSheet = ({ item, open, onOpenChange }: GraphLogDetailsSheetProps) => {
  const { t } = useT("data.gateway.analytics");
  if (!item) return null;

  const failed = item.responseStatus === "failed";
  const outcome = graphLogOutcome(item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl" hideClose>
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <SheetTitle className="truncate text-lg font-semibold">
                  {item.schemaName || item.operationName || t("GRAPH_LOG_DETAILS_SHEET.REQUEST")}
                </SheetTitle>
                <span className="text-xs text-muted-foreground">
                  {formatDateTimeWithSeconds(item.timestamp)} · {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                aria-label={t("GRAPH_LOG_DETAILS_SHEET.CLOSE_DETAILS")}
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="capitalize"
                variant={
                  outcome === "allowed" ? "success" : outcome === "denied" ? "info" : "error"
                }
              >
                {outcome}
              </Badge>
              {failed && item.failureKind && (
                <Badge variant="error">{failureKindLabel(item.failureKind)}</Badge>
              )}
              {item.operationType && <Badge variant="secondary">{item.operationType}</Badge>}
              <Badge variant="secondary">{item.inAppRequest ? t("GRAPH_LOG_DETAILS_SHEET.IN_APP") : t("GRAPH_LOG_DETAILS_SHEET.EXTERNAL")}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.OPERATION")} value={item.operationName || "—"} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.DURATION")} value={formatDuration(item.duration)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.ENTITY")} value={item.entityName || "—"} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.COLLECTION")} value={item.collectionName || "—"} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.DOCUMENTS")} value={item.documentCount ?? 0} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.REQUEST_SIZE")} value={formatSize(item.requestSize)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.RESPONSE_SIZE")} value={formatSize(item.responseSize)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.DB_RESPONSE_SIZE")} value={formatSize(item.databaseResponseSize)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.STATUS_CODE")} value={item.statusCode || "—"} />
              {failed && <Field label={t("GRAPH_LOG_DETAILS_SHEET.ERROR_CODE")} value={item.failureCode || "—"} />}
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.STARTED")} value={formatDateTimeWithSeconds(item.startTime)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.ENDED")} value={formatDateTimeWithSeconds(item.endTime)} />
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.TRACE_ID")} value={item.traceId || "—"} />
            </div>

            {item.userAgent && <Field label={t("GRAPH_LOG_DETAILS_SHEET.CLIENT")} value={item.userAgent} />}

            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("GRAPH_LOG_DETAILS_SHEET.WHERE_THE_TIME_WENT")}
              </span>
              <PhaseBreakdown
                phases={toPhaseRows({
                  databaseMs: item.databaseMs,
                  policyMs: item.policyMs,
                  validationMs: item.validationMs,
                  publishMs: item.publishMs,
                  totalMs: item.duration,
                })}
                total={item.duration}
              />
            </div>

            {item.failureMessage && <Field label={t("GRAPH_LOG_DETAILS_SHEET.FAILURE_REASON")} value={item.failureMessage} />}

            {item.statusDescription && (
              <Field label={t("GRAPH_LOG_DETAILS_SHEET.STATUS_DESCRIPTION")} value={item.statusDescription} />
            )}

            {item.operationQuery && <CodeBlock label={t("GRAPH_LOG_DETAILS_SHEET.GRAPHQL_QUERY")} value={item.operationQuery} />}
            {item.mongoQuery && <CodeBlock label={t("GRAPH_LOG_DETAILS_SHEET.MONGO_QUERY")} value={item.mongoQuery} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
