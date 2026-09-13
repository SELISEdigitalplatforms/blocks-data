"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import { IGraphLogTimingBreakdown } from "../../models/graph-log-analytics";
import { PhaseBreakdown, toPhaseRows } from "./graph-phase-breakdown";
import { formatDuration } from "./graph-log-formatters";

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
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <CardTitle>Where the time goes</CardTitle>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold leading-none">{formatDuration(total)}</span>
          <span className="text-xs text-muted-foreground/60">average request</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <SpinnerLoader />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load timings. Please try again.</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">No requests in this range.</p>
        ) : (
          <PhaseBreakdown phases={phases} total={total} />
        )}
      </CardContent>
    </Card>
  );
};
