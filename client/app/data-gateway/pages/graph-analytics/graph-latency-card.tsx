"use client";

import { useMemo } from "react";
import { CircleHelp } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui-kits/tooltip/tooltip";
import {
  IGraphLogLatencyBucket,
  IGraphLogLatencySummary,
} from "../../models/graph-log-analytics";
import {
  formatBucketLabel,
  formatDuration,
  showSeriesMarkers,
} from "./graph-log-formatters";

// Percentiles of one measure on one axis. Hues are the design system's chart tokens taken in fixed
// order; identity is carried by the legend and by the labelled tiles above the plot, never by
// colour alone.
const CHART_CONFIG = {
  p50: { label: "p50", color: "hsl(var(--chart-blue))" },
  p95: { label: "p95", color: "hsl(var(--chart-orange))" },
  p99: { label: "p99", color: "hsl(var(--chart-magenta))" },
} satisfies ChartConfig;

interface GraphLatencyCardProps {
  latency?: IGraphLogLatencySummary;
  latencyOverTime?: IGraphLogLatencyBucket[];
  granularity: string;
  isLoading: boolean;
  isError: boolean;
}

const Tile = ({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color?: string;
  hint: string;
}) => (
  <div className="flex h-full min-w-0 flex-col gap-1 rounded-sm border border-border/50 px-4 py-3">
    <div className="flex items-center gap-2">
      {color && (
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="text-xs uppercase tracking-widest text-muted-foreground/60">{label}</span>
    </div>
    <span className="text-2xl font-semibold">{formatDuration(value)}</span>
    <span className="text-xs text-muted-foreground/60">{hint}</span>
  </div>
);

export const GraphLatencyCard = ({
  latency,
  latencyOverTime,
  granularity,
  isLoading,
  isError,
}: GraphLatencyCardProps) => {
  const chartData = useMemo(
    () =>
      (latencyOverTime ?? []).map((bucket) => ({
        ...bucket,
        label: formatBucketLabel(bucket.date, granularity),
      })),
    [latencyOverTime, granularity],
  );

  const hasData = (latencyOverTime ?? []).some((bucket) => bucket.p50 > 0 || bucket.p95 > 0);

  const showDots = showSeriesMarkers(chartData.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Response time
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Explain response time percentiles"
                  className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm space-y-2 p-3 text-xs font-normal" side="right">
                <p className="font-semibold">Response-time percentiles</p>
                <p>
                  <strong>P50:</strong> 50% of requests completed in this time or less. Example: a
                  P50 of 120 ms means 50 of 100 requests completed within 120 ms.
                </p>
                <p>
                  <strong>P95:</strong> 95% of requests completed in this time or less. Example: a
                  P95 of 800 ms means 95 of 100 requests completed within 800 ms; 5 were slower.
                </p>
                <p>
                  <strong>P99:</strong> 99% of requests completed in this time or less. Example: a
                  P99 of 2 s means 99 of 100 requests completed within 2 s; 1 was slower.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <SpinnerLoader />
          </div>
        ) : isError ? (
          <div className="flex h-56 items-center justify-center text-sm text-destructive">
            Couldn&apos;t load response times. Please try again.
          </div>
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground">No requests in this range.</p>
        ) : (
          <>
            <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="p50"
                value={latency?.p50 ?? 0}
                color="hsl(var(--chart-blue))"
                hint="half of requests are faster"
              />
              <Tile
                label="p95"
                value={latency?.p95 ?? 0}
                color="hsl(var(--chart-orange))"
                hint="slowest 1 in 20"
              />
              <Tile
                label="p99"
                value={latency?.p99 ?? 0}
                color="hsl(var(--chart-magenta))"
                hint="slowest 1 in 100"
              />
              <Tile label="Slowest" value={latency?.max ?? 0} hint="single worst request" />
            </div>

            <ChartContainer
              config={CHART_CONFIG}
              className="h-48 w-full"
              role="img"
              aria-label="Response time percentiles over time"
            >
              <LineChart data={chartData} margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value: number) => formatDuration(value)}
                />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => formatDuration(Number(value))} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {(["p50", "p95", "p99"] as const).map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    name={CHART_CONFIG[key].label}
                    type="monotone"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    // Nearest-rank puts p95 and p99 on the same request in any bucket with fewer
                    // than ~20 of them, so the two lines coincide and the last one drawn hides the
                    // other. Dashing the upper line lets the one beneath show through the gaps.
                    strokeDasharray={key === "p99" ? "5 4" : undefined}
                    dot={showDots ? { r: 3 } : false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
};
