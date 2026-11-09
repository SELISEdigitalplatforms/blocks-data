"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";

import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import { IGraphLogTimingBreakdown } from "../../models/graph-log-analytics";
import { AnalyticsCard } from "./analytics-card";
import { PhaseBreakdown, toPhaseRows } from "./graph-phase-breakdown";
import { formatDuration } from "./graph-log-formatters";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface GraphTimingCardProps {
  timing?: IGraphLogTimingBreakdown;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Phases of one average request. A proportion bar per row rather than a chart: five ordered parts
 * of a single measure read better as a ranked list than as a pie or a stack, and the millisecond
 * figure is the number people act on.
 */
export const GraphTimingCard = ({ timing, isLoading, isError }: GraphTimingCardProps) => {
  const { t } = useT("data.gateway.analytics");
  const phases = useMemo(
    () =>
      toPhaseRows({
        databaseMs: timing?.averageDatabase ?? 0,
        policyMs: timing?.averagePolicy ?? 0,
        validationMs: timing?.averageValidation ?? 0,
        publishMs: timing?.averagePublish ?? 0,
        totalMs: timing?.averageTotal ?? 0,
        // The server already worked the remainder out across the range.
        otherMs: timing?.averageOther ?? 0,
      }),
    [timing],
  );

  const total = timing?.averageTotal ?? 0;

  return (
    <AnalyticsCard
      icon={Clock}
      title={t("GRAPH_TIMING_CARD.WHERE_THE_TIME_GOES")}
      headerRight={
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold leading-none">{formatDuration(total)}</span>
          <span className="text-xs text-muted-foreground">{t("GRAPH_TIMING_CARD.AVERAGE_REQUEST")}</span>
        </div>
      }
    >
      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <SpinnerLoader />
        </div>
      )}
      {!isLoading && isError && (
        <p className="text-sm text-destructive">{t("GRAPH_TIMING_CARD.COULDN_T_LOAD_TIMINGS_PLEASE_TRY")}</p>
      )}
      {!isLoading && !isError && total === 0 && (
        <p className="text-sm text-muted-foreground">{t("GRAPH_TIMING_CARD.NO_REQUESTS_IN_THIS_RANGE")}</p>
      )}
      {!isLoading && !isError && total !== 0 && (
        <PhaseBreakdown phases={phases} total={total} />
      )}
    </AnalyticsCard>
  );
};
