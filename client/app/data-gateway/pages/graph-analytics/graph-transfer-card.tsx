"use client";

import { useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui-kits/chart/chart";
import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import {
  IGraphLogOperationStat,
  IGraphLogThroughputBucket,
  IGraphLogThroughputSummary,
} from "../../models/graph-log-analytics";
import { AnalyticsCard } from "./analytics-card";
import { formatBucketLabel, formatSize } from "./graph-log-formatters";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

// One measure, one hue — the card title names it, so no legend.
const CHART_CONFIG = {
  totalBytes: { get label() { return tStatic("data.gateway.analytics", "GRAPH_TRANSFER_CARD.TRANSFERRED"); }, color: "hsl(var(--chart-purple))" },
} satisfies ChartConfig;

const HEAVIEST_ROWS = 5;

interface GraphTransferCardProps {
  throughput?: IGraphLogThroughputSummary;
  throughputOverTime?: IGraphLogThroughputBucket[];
  operationStats: IGraphLogOperationStat[];
  granularity: string;
  isLoading: boolean;
  isError: boolean;
}

export const GraphTransferCard = ({
  throughput,
  throughputOverTime,
  operationStats,
  granularity,
  isLoading,
  isError,
}: GraphTransferCardProps) => {
  const { t } = useT("data.gateway.analytics");
  const chartData = useMemo(
    () =>
      (throughputOverTime ?? []).map((bucket) => ({
        ...bucket,
        label: formatBucketLabel(bucket.date, granularity),
        totalBytes: bucket.requestBytes + bucket.responseBytes,
      })),
    [throughputOverTime, granularity],
  );

  // Ranked by average, not total: a rarely-called field returning megabytes each time is the one
  // worth paging, and ranking by total would just re-list the busiest fields.
  const heaviest = useMemo(
    () =>
      [...operationStats]
        .filter((stat) => stat.averageResponseSize > 0)
        .sort((a, b) => b.averageResponseSize - a.averageResponseSize)
        .slice(0, HEAVIEST_ROWS),
    [operationStats],
  );

  const hasData = chartData.some((bucket) => bucket.totalBytes > 0);

  return (
    <AnalyticsCard
      icon={ArrowUpDown}
      title={t("GRAPH_TRANSFER_CARD.DATA_TRANSFER")}
      headerRight={
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold leading-none">
            {formatSize(throughput?.totalBytes ?? 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("GRAPH_TRANSFER_CARD.IN_OUT", {
              requestSize: formatSize(throughput?.requestBytes ?? 0),
              responseSize: formatSize(throughput?.responseBytes ?? 0),
            })}
          </span>
        </div>
      }
      contentClassName="flex flex-col gap-6"
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <SpinnerLoader />
        </div>
      ) : isError ? (
        <div className="flex h-40 items-center justify-center text-sm text-destructive">
          {t("GRAPH_TRANSFER_CARD.COULDN_T_LOAD_DATA_TRANSFER_PLEASE")}
        </div>
      ) : !hasData ? (
        <p className="text-sm text-muted-foreground">{t("GRAPH_TRANSFER_CARD.NO_REQUESTS_IN_THIS_RANGE")}</p>
      ) : (
        <>
          <ChartContainer
            config={CHART_CONFIG}
            className="h-40 w-full"
            role="img"
            aria-label={t("GRAPH_TRANSFER_CARD.BYTES_TRANSFERRED_OVER_TIME")}
          >
            <BarChart data={chartData} margin={{ left: 4, right: 12, top: 4 }}>
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
                width={64}
                tickFormatter={(value: number) => formatSize(value)}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => formatSize(Number(value))} />}
              />
              <Bar
                dataKey="totalBytes"
                name="Transferred"
                fill="var(--color-totalBytes)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("GRAPH_TRANSFER_CARD.HEAVIEST_RESPONSES")}
            </span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("GRAPH_TRANSFER_CARD.SCHEMA")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("GRAPH_TRANSFER_CARD.AVG_DOCS")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("GRAPH_TRANSFER_CARD.AVG_RESPONSE")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("GRAPH_TRANSFER_CARD.LARGEST")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("GRAPH_TRANSFER_CARD.TOTAL")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heaviest.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("GRAPH_TRANSFER_CARD.NO_RESPONSES_WITH_A_RECORDED_SIZE")}
                    </TableCell>
                  </TableRow>
                ) : (
                  heaviest.map((stat) => (
                    <TableRow key={stat.schemaName}>
                      <TableCell className="font-medium">{stat.schemaName}</TableCell>
                      <TableCell
                        className="whitespace-nowrap"
                        title={t("GRAPH_TRANSFER_CARD.LARGEST_MAXDOCUMENTCOUNT", { maxDocumentCount: stat.maxDocumentCount })}
                      >
                        {stat.averageDocumentCount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatSize(stat.averageResponseSize)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatSize(stat.maxResponseSize)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatSize(stat.totalBytes)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </AnalyticsCard>
  );
};
