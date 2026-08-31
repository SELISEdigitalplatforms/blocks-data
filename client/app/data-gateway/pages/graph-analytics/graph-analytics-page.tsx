"use client";

import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { BREADCRUMB_CUSTOM_TITLES } from "@/constants/breadcrumb-custom-title";
import { DateRangeFilter } from "@/components/date-range-filter/date-range-filter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { DataGatewayActions } from "../../components/data-gateway-actions";
import { GraphAnalyticsOverview } from "./graph-analytics-overview";
import { formatCalendarDate } from "./graph-log-formatters";
import { GraphLogHistory } from "./graph-log-history";

// The picker works in the browser's timezone, so the calendar date has to be formatted locally —
// toISOString() would roll a midnight selection back to the previous day east of UTC.
const toIsoDate = (date: Date) => format(date, "yyyy-MM-dd");

export const GraphAnalytics = () => {
  useEffect(() => {
    BREADCRUMB_CUSTOM_TITLES["/services/data-gateway"] = "Data Gateway";
    BREADCRUMB_CUSTOM_TITLES["/services/data-gateway/analytics"] = "Analytics";
  }, []);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const from = dateRange?.from ? toIsoDate(dateRange.from) : undefined;
  const to = dateRange?.to ? toIsoDate(dateRange.to) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <PageBreadcrumb breadcrumbIndex={3} />
        <DataGatewayActions />
      </div>

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        {/* The range sits with the tabs it filters — one range drives both. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">Log history</TabsTrigger>
          </TabsList>
          <DateRangeFilter
            title="Date range"
            date={dateRange}
            onDateChange={setDateRange}
            formatLabel={formatCalendarDate}
          />
        </div>

        <TabsContent value="overview">
          <GraphAnalyticsOverview from={from} to={to} />
        </TabsContent>

        <TabsContent value="history">
          <GraphLogHistory from={from} to={to} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
