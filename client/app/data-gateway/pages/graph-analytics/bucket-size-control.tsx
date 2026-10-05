import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { GraphLogGranularity } from "../../models/graph-log-analytics";

/** Longest range, in calendar days, that hourly buckets still read as a chart (~336 points). */
export const HOURLY_MAX_DAYS = 14;

const OPTIONS: { value: GraphLogGranularity; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

interface BucketSizeControlProps {
  value: GraphLogGranularity;
  // eslint-disable-next-line no-unused-vars
  onChange: (value: GraphLogGranularity) => void;
  isHourlyAllowed: boolean;
}

export function BucketSizeControl({ value, onChange, isHourlyAllowed }: BucketSizeControlProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="radiogroup"
        aria-label="Bucket size"
        className="inline-flex h-8 items-center rounded-md border border-border/40 p-0.5"
      >
        {OPTIONS.map((option) => {
          const isDisabled = option.value === "hourly" && !isHourlyAllowed;
          const isSelected = value === option.value;
          const button = (
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "h-full rounded-sm px-4 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              {option.label}
            </button>
          );

          if (!isDisabled)
            return (
              <span key={option.value} className="h-full">
                {button}
              </span>
            );

          // A disabled button fires no pointer events, so the tooltip hangs off a wrapper.
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="h-full">
                  {button}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                Hourly is available for ranges up to {HOURLY_MAX_DAYS} days.
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
