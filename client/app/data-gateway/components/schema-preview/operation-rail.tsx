import { cn } from "@/lib/utils";
import { OPERATIONS, type OperationGroup } from "./operations";

type OperationRailProps = {
  value: OperationGroup;
  onChange: (value: OperationGroup) => void;
};

/** The vertical Query / Insert / Update / Delete rail of the preview drawer. */
export function OperationRail({ value: selected, onChange }: OperationRailProps) {
  return (
    <div className="flex shrink-0 flex-col border-r border-border/40 py-2">
      {OPERATIONS.map(({ value, label, icon: Icon, iconColor, indicatorColor }) => {
        const isActive = selected === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "relative flex w-16 flex-col items-center gap-1.5 px-1 py-3 text-xs font-medium outline-hidden transition-all duration-150",
              isActive
                ? "bg-primary/10 text-foreground"
                : "text-foreground/70 hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {isActive && (
              <span
                className={cn(
                  "absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-l-full",
                  indicatorColor,
                )}
              />
            )}
            <Icon className={cn("h-4 w-4 transition-colors", isActive ? iconColor : "text-foreground/60")} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
