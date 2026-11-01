"use client";

import { useMemo } from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
import { IGraphLogLatencyBucket, IGraphLogLatencySummary } from "../../models/graph-log-analytics";
import { AnalyticsCard } from "./analytics-card";
import { formatBucketLabel, formatDuration, showSeriesMarkers } from "./graph-log-formatters";
import { useT } from "@seliseblocks/genesis-os/i18n";

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
  <div className="flex h-full min-w-0 flex-col gap-1 rounded-sm border border-border/40 px-4 py-3">
    <div className="flex items-center gap-2">
      {color && (
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
    <span className="text-2xl font-semibold">{formatDuration(value)}</span>
    <span className="text-xs text-muted-foreground">{hint}</span>
  </div>
);

export const GraphLatencyCard = ({
  latency,
  latencyOverTime,
  granularity,
  isLoading,
  isError,
}: GraphLatencyCardProps) => {
  const { t } = useT("data.gateway.analytics");
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
    <AnalyticsCard
      icon={Gauge}
      title={
        <span className="flex items-center gap-2">
          {t("GRAPH_LATENCY_CARD.RESPONSE_TIME")}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("GRAPH_LATENCY_CARD.EXPLAIN_RESPONSE_TIME_PERCENTILES")}
                  className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm space-y-2 p-3 text-xs font-normal" side="right">
                <p className="font-semibold">{t("GRAPH_LATENCY_CARD.RESPONSE_TIME_PERCENTILES")}</p>
                <p>
                  <strong>P50:</strong> {t("GRAPH_LATENCY_CARD.50_OF_REQUESTS_COMPLETED_IN_THIS")}
                </p>
                <p>
                  <strong>P95:</strong> {t("GRAPH_LATENCY_CARD.95_OF_REQUESTS_COMPLETED_IN_THIS")}
                </p>
                <p>
                  <strong>P99:</strong> {t("GRAPH_LATENCY_CARD.99_OF_REQUESTS_COMPLETED_IN_THIS")}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      }
      contentClassName="flex flex-col gap-5"
    >
      {isLoading ? (
        <div className="flex h-56 items-center justify-center">
          <SpinnerLoader />
        </div>
      ) : isError ? (
        <div className="flex h-56 items-center justify-center text-sm text-destructive">
          {t("GRAPH_LATENCY_CARD.COULDN_T_LOAD_RESPONSE_TIMES_PLEASE")}
        </div>
      ) : !hasData ? (
        <p className="text-sm text-muted-foreground">{t("GRAPH_LATENCY_CARD.NO_REQUESTS_IN_THIS_RANGE")}</p>
      ) : (
        <>
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="p50"
              value={latency?.p50 ?? 0}
              color="hsl(var(--chart-blue))"
              hint={t("GRAPH_LATENCY_CARD.HALF_OF_REQUESTS_ARE_FASTER")}
            />
            <Tile
              label="p95"
              value={latency?.p95 ?? 0}
              color="hsl(var(--chart-orange))"
              hint={t("GRAPH_LATENCY_CARD.SLOWEST_1_IN_20")}
            />
            <Tile
              label="p99"
              value={latency?.p99 ?? 0}
              color="hsl(var(--chart-magenta))"
              hint={t("GRAPH_LATENCY_CARD.SLOWEST_1_IN_100")}
            />
            <Tile label={t("GRAPH_LATENCY_CARD.SLOWEST")} value={latency?.max ?? 0} hint={t("GRAPH_LATENCY_CARD.SINGLE_WORST_REQUEST")} />
          </div>

          <ChartContainer
            config={CHART_CONFIG}
            className="h-48 w-full"
            role="img"
            aria-label={t("GRAPH_LATENCY_CARD.RESPONSE_TIME_PERCENTILES_OVER_TIME")}
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
                content={
                  <ChartTooltipContent formatter={(value) => formatDuration(Number(value))} />
                }
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
    </AnalyticsCard>
  );
};
