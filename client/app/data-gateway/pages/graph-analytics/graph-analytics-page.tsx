"use client";

import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { BREADCRUMB_CUSTOM_TITLES } from "@/constants/breadcrumb-custom-title";
import { DateRangeFilter } from "@/components/date-range-filter/date-range-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { showErrorToast } from "@/hooks/use-toast";
import { DataGatewayActions } from "../../components/data-gateway-actions";
import { useGraphLogAnalytics } from "../../hooks/use-graph-log-analytics";
import { GraphLogGranularity } from "../../models/graph-log-analytics";
import { GraphAccessOutcomesCard } from "./graph-access-outcomes-card";
import { GraphCoverageCard } from "./graph-coverage-card";
import { GraphFailuresCard } from "./graph-failures-card";
import { GraphLatencyCard } from "./graph-latency-card";
import { GraphLogHistory } from "./graph-log-history";
import { formatCalendarDate } from "./graph-log-formatters";
import { GraphErrorRatesCard, GraphOperationsCard } from "./graph-operations-card";
import { GraphTimingCard } from "./graph-timing-card";
import { GraphTransferCard } from "./graph-transfer-card";

// The picker works in the browser's timezone, so the calendar date has to be formatted locally —
// toISOString() would roll a midnight selection back to the previous day east of UTC.
const toIsoDate = (date: Date) => format(date, "yyyy-MM-dd");

/** Tabs whose charts are bucketed over time — the only ones the bucket-size control applies to. */
const BUCKETED_TABS = new Set(["traffic", "performance", "reliability"]);

export const GraphAnalytics = () => {
  useEffect(() => {
    BREADCRUMB_CUSTOM_TITLES["/services/data-gateway"] = "Data Gateway";
    BREADCRUMB_CUSTOM_TITLES["/services/data-gateway/analytics"] = "Analytics";
  }, []);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [granularity, setGranularity] = useState<GraphLogGranularity>("daily");
  const [tab, setTab] = useState("traffic");

  const from = dateRange?.from ? toIsoDate(dateRange.from) : undefined;
  const to = dateRange?.to ? toIsoDate(dateRange.to) : undefined;
  // Date#getTimezoneOffset is UTC-minus-local; the API uses the conventional local-minus-UTC.
  const utcOffsetMinutes = -(dateRange?.from ?? new Date()).getTimezoneOffset();

  // One query for every analytics tab: they are all views of the same range.
  const { data, isLoading, isError, error } = useGraphLogAnalytics(
    from,
    to,
    granularity,
    utcOffsetMinutes,
  );
  const analytics = data?.data;

  useEffect(() => {
    if (isError) {
      showErrorToast({
        title: "Couldn't load analytics",
        errors: [error instanceof Error ? error.message : "Something went wrong. Please try again."],
      });
    }
  }, [isError, error]);

  const operationStats = analytics?.operationStats ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <PageBreadcrumb breadcrumbIndex={3} />
        <DataGatewayActions />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex flex-col gap-4"
      >
        {/* Both range controls sit with the tabs they filter — one range, one bucket size, every tab. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="traffic">Traffic</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="reliability">Reliability</TabsTrigger>
            <TabsTrigger value="history">Requests</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {/* Usage and Requests have no time series, so a bucket size would be a dead control. */}
            {BUCKETED_TABS.has(tab) && (
              <Select
                value={granularity}
                onValueChange={(value) => setGranularity(value as GraphLogGranularity)}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Bucket size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            )}
            <DateRangeFilter
              title="Date range"
              date={dateRange}
              onDateChange={setDateRange}
              formatLabel={formatCalendarDate}
            />
          </div>
        </div>

        {/* The analytics tabs count application traffic only, so their totals are lower than the
            log's. Saying so once beats leaving the difference to be discovered. */}
        {tab !== "history" && (
          <p className="text-xs text-muted-foreground/60">
            Schema introspection requests are excluded — see them under Requests.
          </p>
        )}

        <TabsContent value="traffic" className="flex flex-col gap-4">
          <GraphAccessOutcomesCard
            requestsOverTime={analytics?.requestsOverTime}
            failureStats={analytics?.failureStats ?? []}
            granularity={granularity}
            isLoading={isLoading}
            isError={isError}
          />
          <GraphOperationsCard operationStats={operationStats} isError={isError} />
          <GraphCoverageCard
            schemaCoverage={analytics?.schemaCoverage ?? []}
            isLoading={isLoading}
            isError={isError}
          />
        </TabsContent>

        <TabsContent value="performance" className="flex flex-col gap-4">
          <GraphLatencyCard
            latency={analytics?.latency}
            latencyOverTime={analytics?.latencyOverTime}
            granularity={granularity}
            isLoading={isLoading}
            isError={isError}
          />
          <GraphTimingCard timing={analytics?.timing} isLoading={isLoading} isError={isError} />
          <GraphTransferCard
            throughput={analytics?.throughput}
            throughputOverTime={analytics?.throughputOverTime}
            granularity={granularity}
            operationStats={operationStats}
            isLoading={isLoading}
            isError={isError}
          />
        </TabsContent>

        <TabsContent value="reliability" className="flex flex-col gap-4">
          <GraphFailuresCard
            failureStats={analytics?.failureStats ?? []}
            failureHotspots={analytics?.failureHotspots ?? []}
            isLoading={isLoading}
            isError={isError}
          />
          <GraphErrorRatesCard operationStats={operationStats} isError={isError} />
        </TabsContent>

        <TabsContent value="history">
          <GraphLogHistory from={from} to={to} utcOffsetMinutes={utcOffsetMinutes} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
