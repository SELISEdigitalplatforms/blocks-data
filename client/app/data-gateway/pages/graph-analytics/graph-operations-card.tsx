"use client";

import { useMemo } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { IGraphLogOperationStat } from "../../models/graph-log-analytics";
import { AnalyticsCard } from "./analytics-card";
import { formatDuration } from "./graph-log-formatters";
import { OUTCOME_COLORS } from "./graph-outcome-colors";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_ANALYTICS_MODULE = "data.gateway.analytics";

const MAX_BAR_WIDTH_PX = 80;

interface GraphOperationsCardProps {
  operationStats: IGraphLogOperationStat[];
  isError: boolean;
}

const emptyMessage = (isError: boolean) =>
  isError ? tStatic(DATA_GATEWAY_ANALYTICS_MODULE, "GRAPH_OPERATIONS_CARD.COULDN_T_LOAD_DATA_PLEASE_TRY") : tStatic(DATA_GATEWAY_ANALYTICS_MODULE, "GRAPH_OPERATIONS_CARD.NO_REQUESTS_IN_THIS_RANGE");

/** Busiest fields first, with the response times they cost. */
export const GraphOperationsCard = ({ operationStats, isError }: GraphOperationsCardProps) => {
  const { t } = useT(DATA_GATEWAY_ANALYTICS_MODULE);
  const maxCalls = Math.max(1, ...operationStats.map((stat) => stat.calls));

  return (
    <AnalyticsCard icon={BarChart3} title={t("GRAPH_OPERATIONS_CARD.MOST_FREQUENT_OPERATIONS")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.SCHEMA")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.CALLS")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.REST")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.GRAPHQL")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.ALLOWS")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.DENIES")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.ERRORS")}</TableHead>
            <TableHead className="whitespace-nowrap">{t("GRAPH_OPERATIONS_CARD.AVG")}</TableHead>
            <TableHead className="whitespace-nowrap">p95</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operationStats.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {emptyMessage(isError)}
              </TableCell>
            </TableRow>
          ) : (
            operationStats.map((stat) => (
              <TableRow key={stat.schemaName}>
                <TableCell className="font-medium">{stat.schemaName}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{ width: `${(stat.calls / maxCalls) * MAX_BAR_WIDTH_PX}px` }}
                    />
                    <span>{stat.calls}</span>
                  </div>
                </TableCell>
                <TableCell>{stat.restCount}</TableCell>
                <TableCell>{stat.graphQLCount}</TableCell>
                {/* Refused on purpose and actually broken are different problems, so the row
                    shows them apart rather than as one "failed" count — in the same colours the
                    outcome tiles and bars above use. */}
                <TableCell style={{ color: OUTCOME_COLORS.allows }}>{stat.success}</TableCell>
                <TableCell style={{ color: OUTCOME_COLORS.denies }}>{stat.denied}</TableCell>
                <TableCell style={{ color: OUTCOME_COLORS.errors }}>{stat.errored}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDuration(stat.averageDuration)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDuration(stat.p95Duration)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </AnalyticsCard>
  );
};

/** The same fields ranked by how often they fail rather than how often they're called. */
export const GraphErrorRatesCard = ({ operationStats, isError }: GraphOperationsCardProps) => {
  const { t } = useT(DATA_GATEWAY_ANALYTICS_MODULE);
  const errorRateStats = useMemo(
    () => [...operationStats].sort((a, b) => b.errorRate - a.errorRate),
    [operationStats],
  );

  return (
    <AnalyticsCard icon={AlertTriangle} title={t("GRAPH_OPERATIONS_CARD.ERROR_RATES")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.SCHEMA")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.TOTAL")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.FAILED")}</TableHead>
            <TableHead>{t("GRAPH_OPERATIONS_CARD.ERROR_RATE")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errorRateStats.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {emptyMessage(isError)}
              </TableCell>
            </TableRow>
          ) : (
            errorRateStats.map((stat) => (
              <TableRow key={stat.schemaName}>
                <TableCell className="font-medium">{stat.schemaName}</TableCell>
                <TableCell>{stat.calls}</TableCell>
                <TableCell>{stat.failed}</TableCell>
                <TableCell>
                  <Badge variant={stat.errorRate === 0 ? "success" : "error"}>
                    {stat.errorRate}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </AnalyticsCard>
  );
};
