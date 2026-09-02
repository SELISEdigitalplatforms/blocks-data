"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui-kits/sheet/sheet";
import { IGraphLogHistoryItem, failureKindLabel } from "../../models/graph-log-history";
import { PhaseBreakdown, toPhaseRows } from "./graph-phase-breakdown";
import {
  formatDateTimeWithSeconds,
  formatDuration,
  formatRelativeTime,
  formatSize,
} from "./graph-log-formatters";

interface GraphLogDetailsSheetProps {
  item: IGraphLogHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs uppercase tracking-widest text-muted-foreground/60">{label}</span>
    <span className="break-all text-sm text-foreground">{value}</span>
  </div>
);

const CodeBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs uppercase tracking-widest text-muted-foreground/60">{label}</span>
    <pre className="max-h-72 overflow-auto rounded-sm border border-border/50 bg-muted/40 p-3 text-xs leading-relaxed">
      {value}
    </pre>
  </div>
);

export const GraphLogDetailsSheet = ({ item, open, onOpenChange }: GraphLogDetailsSheetProps) => {
  if (!item) return null;

  const failed = item.responseStatus === "failed";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl" hideClose>
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <SheetTitle className="truncate text-lg font-semibold">
                  {item.schemaName || item.operationName || "Request"}
                </SheetTitle>
                <span className="text-xs text-muted-foreground">
                  {formatDateTimeWithSeconds(item.timestamp)} ·{" "}
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Close details"
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={failed ? "error" : "success"}>
                {item.responseStatus || "unknown"}
              </Badge>
              {failed && item.failureKind && (
                <Badge variant="error">{failureKindLabel(item.failureKind)}</Badge>
              )}
              {item.operationType && <Badge variant="secondary">{item.operationType}</Badge>}
              <Badge variant="secondary">{item.inAppRequest ? "In-app" : "External"}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Operation" value={item.operationName || "—"} />
              <Field label="Duration" value={formatDuration(item.duration)} />
              <Field label="Entity" value={item.entityName || "—"} />
              <Field label="Collection" value={item.collectionName || "—"} />
              <Field label="Documents" value={item.documentCount ?? 0} />
              <Field label="Request size" value={formatSize(item.requestSize)} />
              <Field label="Response size" value={formatSize(item.responseSize)} />
              <Field label="DB response size" value={formatSize(item.databaseResponseSize)} />
              <Field label="Status code" value={item.statusCode || "—"} />
              {failed && <Field label="Error code" value={item.failureCode || "—"} />}
              <Field label="Started" value={formatDateTimeWithSeconds(item.startTime)} />
              <Field label="Ended" value={formatDateTimeWithSeconds(item.endTime)} />
              <Field label="Trace ID" value={item.traceId || "—"} />
            </div>

            <Field
              label="Caller"
              value={item.userName || item.userId || "Unauthenticated"}
            />

            {item.userAgent && <Field label="Client" value={item.userAgent} />}

            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground/60">
                Where the time went
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

            {item.failureMessage && (
              <Field label="Failure reason" value={item.failureMessage} />
            )}

            {item.statusDescription && (
              <Field label="Status description" value={item.statusDescription} />
            )}

            {item.operationQuery && <CodeBlock label="GraphQL query" value={item.operationQuery} />}
            {item.mongoQuery && <CodeBlock label="Mongo query" value={item.mongoQuery} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
