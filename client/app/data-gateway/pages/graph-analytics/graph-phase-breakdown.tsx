"use client";

import { formatDuration } from "./graph-log-formatters";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export interface PhaseRow {
  label: string;
  value: number;
}

/**
 * The phases of a request, in the order they are worth reading: the ones you can act on first,
 * then the remainder. "Gateway & transport" is derived rather than measured — whatever the timed
 * phases do not account for (GraphQL parsing and serialization, the HTTP pipeline, the wire).
 */
export const toPhaseRows = (phases: {
  databaseMs: number;
  policyMs: number;
  validationMs: number;
  publishMs: number;
  totalMs: number;
  otherMs?: number;
}): PhaseRow[] => {
  const measured = phases.databaseMs + phases.policyMs + phases.validationMs + phases.publishMs;

  return [
    { label: tStatic("data.gateway.analytics", "GRAPH_PHASE_BREAKDOWN.DATABASE"), value: phases.databaseMs },
    { label: tStatic("data.gateway.analytics", "GRAPH_PHASE_BREAKDOWN.POLICY_CHECKS"), value: phases.policyMs },
    { label: tStatic("data.gateway.analytics", "GRAPH_PHASE_BREAKDOWN.VALIDATION"), value: phases.validationMs },
    { label: tStatic("data.gateway.analytics", "GRAPH_PHASE_BREAKDOWN.EVENT_PUBLISHING"), value: phases.publishMs },
    {
      label: tStatic("data.gateway.analytics", "GRAPH_PHASE_BREAKDOWN.GATEWAY_TRANSPORT"),
      // Clamped: a trace recorded before a phase was instrumented would otherwise go negative.
      value: phases.otherMs ?? Math.max(0, phases.totalMs - measured),
    },
  ];
};

/**
 * Phases as proportion bars. Not a chart: five ordered parts of a single measure read better as a
 * ranked list, and the millisecond figure is the number people act on.
 */
export const PhaseBreakdown = ({ phases, total }: { phases: PhaseRow[]; total: number }) => (
  <div className="flex flex-col gap-3">
    {phases.map((phase) => {
      const share = total === 0 ? 0 : Math.round((phase.value / total) * 100);
      return (
        <div key={phase.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-sm">{phase.label}</span>
          <div className="h-2 flex-1 rounded bg-muted/40">
            <div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-sm">{formatDuration(phase.value)}</span>
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{share}%</span>
        </div>
      );
    })}
  </div>
);
