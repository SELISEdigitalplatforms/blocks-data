import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import type { ExposureBreakdown, SecurityAlert } from "../../utils/security-summary";

const SEGMENT_FILL: Record<ExposureBreakdown["segments"][number]["tier"], string> = {
  public: "bg-access-public-dot",
  user: "bg-access-user-dot",
  custom: "bg-access-custom-dot",
  inherited: "bg-access-inherited-dot",
};

const ALERT_STYLE: Record<SecurityAlert["severity"], string> = {
  high: "border-access-public-border bg-access-public-bg text-access-public-fg",
  medium: "border-access-user-border bg-access-user-bg text-access-user-fg",
};

/**
 * Every grant in the project, and the handful worth acting on.
 *
 * The three flat counters this replaces said how many grants were public
 * without saying what share that was, or which schemas. The bar gives the
 * proportion; the tiles filter the table down to the schemas behind a number.
 */
export function SecurityExposureSummary({
  breakdown,
  alerts,
  onAlertClick,
}: {
  breakdown: ExposureBreakdown;
  alerts: SecurityAlert[];
  onAlertClick: (alert: SecurityAlert) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-5 border-b border-border/40 px-5 py-4 xl:flex-row xl:items-stretch xl:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Access surface</h3>
          <span className="text-xs text-muted-foreground">
            {breakdown.totalGrants} grants across {breakdown.schemaCount} entity{" "}
            {breakdown.schemaCount === 1 ? "schema" : "schemas"}
          </span>
        </div>

        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
          {breakdown.segments.map((segment) => (
            <span
              key={segment.tier}
              className={SEGMENT_FILL[segment.tier]}
              style={{ width: segment.width }}
              title={`${segment.label} — ${segment.count} grants`}
            />
          ))}
        </div>

        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {breakdown.segments.map((segment) => (
            <li key={segment.tier} className="flex items-baseline gap-1.5">
              <span
                className={cn("h-2 w-2 shrink-0 self-center rounded-sm", SEGMENT_FILL[segment.tier])}
                aria-hidden
              />
              <span className="text-base font-bold tracking-tight text-foreground">
                {segment.count}
              </span>
              <span className="text-xs text-muted-foreground">{segment.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden w-px shrink-0 bg-border/40 xl:block" />

      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[430px]">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => onAlertClick(alert)}
            disabled={alert.count === 0}
            // A row's exposure column carries the same words, so the tile says
            // what it does rather than repeating its own label.
            aria-label={`Filter by ${alert.label.toLowerCase()} — ${alert.count}`}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-opacity",
              alert.count === 0
                ? "border-border/50 text-muted-foreground"
                : cn(ALERT_STYLE[alert.severity], "hover:opacity-85"),
            )}
          >
            <span className="flex items-center gap-1.5">
              {alert.count > 0 &&
                (alert.severity === "high" ? (
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                ))}
              <span className="text-xl font-bold leading-none tracking-tight">
                {alert.count}
              </span>
            </span>
            <span className="text-xs font-semibold">{alert.label}</span>
            <span className="text-[10.5px] leading-snug text-muted-foreground">
              {alert.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
