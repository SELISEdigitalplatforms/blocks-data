import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { useRef, type KeyboardEvent } from "react";
import { isGraphQLDeprecated } from "../../utils/graphql-deprecation";

export type Protocol = "rest" | "graphql";

const PROTOCOLS: readonly Protocol[] = ["rest", "graphql"];

/** Arrow keys move the selection, as in the WAI-ARIA radio group pattern: Right and Down forward, Left and Up back. */
const ARROW_STEP: Record<string, 1 | -1 | undefined> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

type ProtocolSwitchProps = {
  value: Protocol;
  onChange: (value: Protocol) => void;
};

/** The REST | GraphQL segmented switch; the GraphQL segment carries a `deprecated` tag while the flag is set. */
export function ProtocolSwitch({ value: selected, onChange }: ProtocolSwitchProps) {
  const { t } = useT("data.gateway.schema");
  const graphqlDeprecated = isGraphQLDeprecated();
  const radios = useRef<Partial<Record<Protocol, HTMLButtonElement | null>>>({});
  // Literal keys, so static key extraction sees them.
  const labels: Record<Protocol, string> = {
    rest: t("PLAYGROUND_PAGE.REST"),
    graphql: t("PLAYGROUND_PAGE.GRAPHQL"),
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: Protocol) => {
    // Alt+Left, Cmd+Left and the like are browser shortcuts: leave them alone.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const step = ARROW_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const index = PROTOCOLS.indexOf(current);
    const next = PROTOCOLS[(index + step + PROTOCOLS.length) % PROTOCOLS.length];
    radios.current[next]?.focus();
    onChange(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("PLAYGROUND_PAGE.PROTOCOL")}
      className="flex h-7 rounded-md border border-border/60 bg-card p-0.5"
    >
      {PROTOCOLS.map((value) => (
        <button
          key={value}
          ref={(element) => {
            radios.current[value] = element;
          }}
          type="button"
          role="radio"
          aria-checked={selected === value}
          tabIndex={selected === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => handleKeyDown(event, value)}
          className={cn(
            "flex items-center gap-1.5 rounded-[4px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
            selected === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[value]}
          {value === "graphql" && graphqlDeprecated && (
            <span className="rounded-sm bg-amber-500/10 px-1 text-[10px] font-medium leading-4 text-amber-600 dark:text-amber-400">
              {t("PLAYGROUND_PAGE.DEPRECATED")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
