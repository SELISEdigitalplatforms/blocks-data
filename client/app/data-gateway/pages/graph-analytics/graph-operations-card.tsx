"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { IGraphLogOperationStat } from "../../models/graph-log-analytics";
import { formatDuration } from "./graph-log-formatters";
import { OUTCOME_COLORS } from "./graph-outcome-colors";

const MAX_BAR_WIDTH_PX = 80;

interface GraphOperationsCardProps {
  operationStats: IGraphLogOperationStat[];
  isError: boolean;
}

const emptyMessage = (isError: boolean) =>
  isError ? "Couldn't load data. Please try again." : "No requests in this range.";

/** Busiest fields first, with the response times they cost. */
export const GraphOperationsCard = ({ operationStats, isError }: GraphOperationsCardProps) => {
  const maxCalls = Math.max(1, ...operationStats.map((stat) => stat.calls));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most frequent operations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schema</TableHead>
              <TableHead>Calls</TableHead>
              <TableHead>Allows</TableHead>
              <TableHead>Denies</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead className="whitespace-nowrap">Avg</TableHead>
              <TableHead className="whitespace-nowrap">p95</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operationStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
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
      </CardContent>
    </Card>
  );
};

/** The same fields ranked by how often they fail rather than how often they're called. */
export const GraphErrorRatesCard = ({ operationStats, isError }: GraphOperationsCardProps) => {
  const errorRateStats = useMemo(
    () => [...operationStats].sort((a, b) => b.errorRate - a.errorRate),
    [operationStats],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error rates</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schema</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Error rate</TableHead>
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
      </CardContent>
    </Card>
  );
};
