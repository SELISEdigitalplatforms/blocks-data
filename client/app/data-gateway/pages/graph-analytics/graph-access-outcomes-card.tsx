"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui-kits/chart/chart";
import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import {
  IGraphLogFailureStat,
  IGraphLogRequestsOverTimeBucket,
} from "../../models/graph-log-analytics";
import { failureKindLabel } from "../../models/graph-log-history";
import { formatBucketLabel } from "./graph-log-formatters";
import { OUTCOME_COLORS } from "./graph-outcome-colors";

/**
 * A request the gateway refused on purpose, as opposed to one that broke. Validation belongs here
 * with the access checks: rejecting bad input is the gateway working, not failing. Keeping these
 * apart is the point of this card — a spike in denials is an access-control, credentials or client
 * story, while a spike in errors is an engineering one, and a single "failed" number hides which.
 *
 * The server applies the same rule when bucketing (GatewayFailureKind.IsDenial); this set only
 * sorts the per-reason detail lines into the right tile.
 */
const DENIED_KINDS = new Set(["authentication", "authorization", "validation"]);

// Status colours, not a categorical ramp: these are states, and each ships with its own label.
const CHART_CONFIG = {
  success: { label: "Allows", color: OUTCOME_COLORS.allows },
  denied: { label: "Denies", color: OUTCOME_COLORS.denies },
  errored: { label: "Errors", color: OUTCOME_COLORS.errors },
} satisfies ChartConfig;

interface GraphAccessOutcomesCardProps {
  requestsOverTime?: IGraphLogRequestsOverTimeBucket[];
  failureStats: IGraphLogFailureStat[];
  granularity: string;
  isLoading: boolean;
  isError: boolean;
}

const Outcome = ({
  label,
  count,
  share,
  detail,
  color,
}: {
  label: string;
  count: number;
  share: number;
  detail: string;
  color: string;
}) => (
  <div className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-sm border border-border/50 px-4 py-3">
    {/* The number wears the series colour, so the tiles double as the chart's legend. */}
    <span className="text-2xl font-semibold" style={{ color }}>
      {count}
    </span>
    <span className="text-xs text-muted-foreground">
      {label} · {share}%
    </span>
    <span className="text-xs text-muted-foreground/60">{detail || "—"}</span>
  </div>
);

export const GraphAccessOutcomesCard = ({
  requestsOverTime,
  failureStats,
  granularity,
  isLoading,
  isError,
}: GraphAccessOutcomesCardProps) => {
  const chartData = useMemo(
    () =>
      (requestsOverTime ?? []).map((bucket) => ({
        ...bucket,
        label: formatBucketLabel(bucket.date, granularity),
      })),
    [requestsOverTime, granularity],
  );

  const outcomes = useMemo(() => {
    // Totals come from the same buckets the chart plots, so the tiles can never disagree with it.
    const totals = (requestsOverTime ?? []).reduce(
      (running, bucket) => ({
        allowed: running.allowed + bucket.success,
        denied: running.denied + bucket.denied,
        errored: running.errored + bucket.errored,
      }),
      { allowed: 0, denied: 0, errored: 0 },
    );

    const describe = (stats: IGraphLogFailureStat[]) =>
      stats
        .map((stat) => `${stat.count} ${failureKindLabel(stat.failureKind).toLowerCase()}`)
        .join(" · ");

    return {
      ...totals,
      total: totals.allowed + totals.denied + totals.errored,
      deniedDetail: describe(failureStats.filter((stat) => DENIED_KINDS.has(stat.failureKind))),
      erroredDetail: describe(failureStats.filter((stat) => !DENIED_KINDS.has(stat.failureKind))),
    };
  }, [requestsOverTime, failureStats]);

  const share = (count: number) =>
    outcomes.total === 0 ? 0 : Math.round((count / outcomes.total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests over time</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <SpinnerLoader />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load outcomes. Please try again.</p>
        ) : outcomes.total === 0 ? (
          <p className="text-sm text-muted-foreground">No requests in this range.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <Outcome
                label="Allows"
                count={outcomes.allowed}
                share={share(outcomes.allowed)}
                detail="served"
                color={OUTCOME_COLORS.allows}
              />
              <Outcome
                label="Denies"
                count={outcomes.denied}
                share={share(outcomes.denied)}
                detail={outcomes.deniedDetail}
                color={OUTCOME_COLORS.denies}
              />
              <Outcome
                label="Errors"
                count={outcomes.errored}
                share={share(outcomes.errored)}
                detail={outcomes.erroredDetail}
                color={OUTCOME_COLORS.errors}
              />
            </div>

            <ChartContainer
              config={CHART_CONFIG}
              className="h-48 w-full"
              role="img"
              aria-label="Allowed, denied and errored requests over time"
            >
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {(["success", "denied", "errored"] as const).map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={CHART_CONFIG[key].label}
                    stackId="outcome"
                    fill={`var(--color-${key})`}
                    // A hairline of the card colour keeps stacked segments from bleeding together.
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
};
