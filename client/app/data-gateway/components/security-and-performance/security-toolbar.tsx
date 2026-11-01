import { cn } from "@/lib/utils";
import { ArrowDownWideNarrow } from "lucide-react";

import type { SecurityFilter } from "../../utils/security-summary";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const CHIPS: { value: SecurityFilter; label: string }[] = [
  { value: "all", get label() { return tStatic("data.gateway.schema", "common:ALL"); } },
  { value: "attention", get label() { return tStatic("data.gateway.schema", "SECURITY_TOOLBAR.NEEDS_ATTENTION"); } },
  { value: "public", get label() { return tStatic("data.gateway.schema", "SECURITY_TOOLBAR.PUBLIC"); } },
  { value: "user", get label() { return tStatic("data.gateway.schema", "SECURITY_TOOLBAR.SIGNED_IN"); } },
  { value: "custom", get label() { return tStatic("data.gateway.schema", "SECURITY_TOOLBAR.CUSTOM"); } },
];

/**
 * Narrow the table, and choose what "first" means.
 *
 * Both act on the fetched set. Risk order is a client-side sort because the
 * API's sort keys are schema attributes, and exposure is a judgement about four
 * of them at once.
 */
export function SecurityToolbar({
  filter,
  counts,
  sortByRisk,
  onFilterChange,
  onSortToggle,
}: {
  filter: SecurityFilter;
  counts: Record<SecurityFilter, number>;
  sortByRisk: boolean;
  onFilterChange: (filter: SecurityFilter) => void;
  onSortToggle: () => void;
}) {
  const { t } = useT("data.gateway.schema");
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-5 py-2.5">
      {CHIPS.map(({ value, label }) => {
        const active = filter === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(value)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
              active
                ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                : "border-border/50 font-medium text-muted-foreground hover:text-foreground",
              value === "attention" && counts.attention > 0 && !active &&
                "border-access-public-border text-access-public-fg",
            )}
          >
            {label}
            <span className="opacity-60">{counts[value]}</span>
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        aria-pressed={sortByRisk}
        onClick={onSortToggle}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          sortByRisk
            ? "border-primary/30 bg-primary/10 font-medium text-primary"
            : "border-border/50 text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />
        {t("SECURITY_TOOLBAR.EXPOSURE_HIGH_TO_LOW")}
      </button>
    </div>
  );
}
