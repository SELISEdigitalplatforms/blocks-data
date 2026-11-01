"use client";

import { XCircle } from "lucide-react";

import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { IGraphLogFailureHotspot, IGraphLogFailureStat } from "../../models/graph-log-analytics";
import { failureKindLabel } from "../../models/graph-log-history";
import { AnalyticsCard } from "./analytics-card";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface GraphFailuresCardProps {
  failureStats: IGraphLogFailureStat[];
  failureHotspots: IGraphLogFailureHotspot[];
  isLoading: boolean;
  isError: boolean;
}

export const GraphFailuresCard = ({
  failureStats,
  failureHotspots,
  isLoading,
  isError,
}: GraphFailuresCardProps) => {
  const { t } = useT("data.gateway.analytics");
  const totalFailures = failureStats.reduce((total, stat) => total + stat.count, 0);

  return (
    <AnalyticsCard icon={XCircle} title={t("GRAPH_FAILURES_CARD.FAILURES_BY_REASON")}>
      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <SpinnerLoader />
        </div>
      ) : failureStats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isError ? t("GRAPH_FAILURES_CARD.COULDN_T_LOAD_DATA_PLEASE_TRY") : t("GRAPH_FAILURES_CARD.NO_FAILED_REQUESTS_IN_THIS_RANGE")}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">
            {failureStats.map((stat) => (
              <div
                key={stat.failureKind}
                className="flex min-w-[140px] flex-col gap-1 rounded-sm border border-border/40 px-4 py-3"
              >
                <span className="text-2xl font-semibold text-destructive">{stat.count}</span>
                <span className="text-xs text-muted-foreground">
                  {failureKindLabel(stat.failureKind)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("GRAPH_FAILURES_CARD.PERCENT_OF_FAILURES", { percent: Math.round((stat.count / totalFailures) * 100) })}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("GRAPH_FAILURES_CARD.WHERE_THEY_HAPPEN")}
            </span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("GRAPH_FAILURES_CARD.SCHEMA")}</TableHead>
                  <TableHead>{t("GRAPH_FAILURES_CARD.REASON")}</TableHead>
                  <TableHead>{t("GRAPH_FAILURES_CARD.FAILURES")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("GRAPH_FAILURES_CARD.FROM_OUTSIDE")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failureHotspots.map((hotspot) => (
                  <TableRow key={`${hotspot.schemaName}-${hotspot.failureKind}`}>
                    <TableCell className="font-medium">{hotspot.schemaName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {failureKindLabel(hotspot.failureKind)}
                    </TableCell>
                    <TableCell>{hotspot.count}</TableCell>
                    {/* Concentrated in one schema reads as a policy problem; spread across
                        many and coming from outside reads as probing. */}
                    <TableCell
                      className={
                        hotspot.externalCount > 0 ? "text-destructive" : "text-muted-foreground"
                      }
                    >
                      {hotspot.externalCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
};
