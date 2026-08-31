"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui-kits/chart/chart";
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
import { showErrorToast } from "@/hooks/use-toast";
import { useGraphLogAnalytics } from "../../hooks/use-graph-log-analytics";
import { GraphLogGranularity } from "../../models/graph-log-analytics";
import { failureKindLabel } from "../../models/graph-log-history";
import { formatDayLabel } from "./graph-log-formatters";

const CHART_CONFIG = {
  success: { label: "Success", color: "hsl(var(--chart-blue))" },
  failed: { label: "Failed", color: "hsl(var(--chart-red))" },
} satisfies ChartConfig;

const MAX_BAR_WIDTH_PX = 80;

interface GraphAnalyticsOverviewProps {
  /** ISO calendar dates ("2026-08-31") for the selected range. */
  from?: string;
  to?: string;
}

export const GraphAnalyticsOverview = ({ from, to }: GraphAnalyticsOverviewProps) => {
  const [granularity, setGranularity] = useState<GraphLogGranularity>("daily");

  const { data, isLoading, isError, error } = useGraphLogAnalytics(from, to, granularity);
  const analytics = data?.data;

  useEffect(() => {
    if (isError) {
      showErrorToast({
        title: "Couldn't load analytics",
        errors: [error instanceof Error ? error.message : "Something went wrong. Please try again."],
      });
    }
  }, [isError, error]);

  const chartData = useMemo(
    () =>
      (analytics?.requestsOverTime ?? []).map((bucket) => ({
        ...bucket,
        label: formatDayLabel(bucket.date),
      })),
    [analytics?.requestsOverTime],
  );

  const operationStats = useMemo(() => analytics?.operationStats ?? [], [analytics?.operationStats]);
  const failureStats = useMemo(() => analytics?.failureStats ?? [], [analytics?.failureStats]);
  const totalFailures = failureStats.reduce((total, stat) => total + stat.count, 0);
  const maxCalls = Math.max(1, ...operationStats.map((stat) => stat.calls));
  const errorRateStats = useMemo(
    () => [...operationStats].sort((a, b) => b.errorRate - a.errorRate),
    [operationStats],
  );

  const failureEmptyMessage = isError
    ? "Couldn't load data. Please try again."
    : "No failed requests in this range.";

  const tableEmptyMessage = isError
    ? "Couldn't load data. Please try again."
    : "No requests in this range.";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Requests over time</CardTitle>
          <Select
            value={granularity}
            onValueChange={(value) => setGranularity(value as GraphLogGranularity)}
          >
            <SelectTrigger className="w-[100px]" aria-label="Bucket size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <SpinnerLoader />
            </div>
          ) : isError ? (
            <div className="flex h-48 items-center justify-center text-sm text-destructive">
              Couldn&apos;t load request volume. Please try again.
            </div>
          ) : (
            <ChartContainer
              config={CHART_CONFIG}
              className="h-48 w-full"
              role="img"
              aria-label="Request volume over time"
            >
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="success" name="Success" stackId="requests" fill="var(--color-success)" />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  stackId="requests"
                  fill="var(--color-failed)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Failures by reason</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-20 items-center justify-center">
              <SpinnerLoader />
            </div>
          ) : failureStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">{failureEmptyMessage}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {failureStats.map((stat) => (
                <div
                  key={stat.failureKind}
                  className="flex min-w-[140px] flex-col gap-1 rounded-sm border border-border/50 px-4 py-3"
                >
                  <span className="text-2xl font-semibold text-destructive">{stat.count}</span>
                  <span className="text-xs text-muted-foreground">
                    {failureKindLabel(stat.failureKind)}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {Math.round((stat.count / totalFailures) * 100)}% of failures
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                  <TableHead>Success</TableHead>
                  <TableHead>Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operationStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {tableEmptyMessage}
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
                      <TableCell className="text-green-700">{stat.success}</TableCell>
                      <TableCell className="text-red-700">{stat.failed}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
                      {tableEmptyMessage}
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
      </div>
    </div>
  );
};
