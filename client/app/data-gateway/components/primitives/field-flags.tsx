import { cn } from "@/lib/utils";

import type { IField } from "../../models/data-service";

/**
 * The three genuine booleans on a property, as one compact strip.
 *
 * IsRequired is deliberately absent: it is a 4-state enum (None | Insert |
 * Update | Both), so it gets its own column via <RequiredBadge />. Folding it
 * in here would silently lose Insert/Update/Both.
 *
 * PII is the only flag that carries colour — it is a governance signal rather
 * than a shape, and is the one people scan for.
 */
export type FieldFlag = "ARR" | "PII" | "UQ";

const FLAG_TITLES: Record<FieldFlag, string> = {
  ARR: "Array",
  PII: "Personally identifiable data",
  UQ: "Unique",
};

/**
 * Each flag's own "set" colour. ARR reuses the app's primary blue; UQ borrows
 * the `access-custom` teal token (already paired for light/dark) rather than
 * inventing a fourth palette — ARR and UQ read as different colours at a
 * glance instead of collapsing into one shared tint. PII keeps its own warm
 * tokens, defined separately since it also needs a distinct off-state title.
 */
const FLAG_TINT: Record<Exclude<FieldFlag, "PII">, { bg: string; fg: string; border: string }> = {
  ARR: { bg: "bg-primary/10", fg: "text-primary", border: "border-primary/30" },
  UQ: {
    bg: "bg-access-custom-bg",
    fg: "text-access-custom-fg",
    border: "border-access-custom-border",
  },
};

export function flagsFromField(field: Pick<IField, "isArray" | "isPIIData" | "isUniqueData">) {
  const flags: FieldFlag[] = [];
  if (field.isArray) flags.push("ARR");
  if (field.isPIIData) flags.push("PII");
  if (field.isUniqueData) flags.push("UQ");
  return flags;
}

export function FieldFlagChip({ flag, className }: { flag: FieldFlag; className?: string }) {
  return (
    <span
      title={FLAG_TITLES[flag]}
      className={cn(
        "inline-flex h-[22px] items-center rounded px-2 text-[10.5px] font-bold tracking-wide",
        flag === "PII" ? "bg-flag-pii-bg text-flag-pii-fg" : cn(FLAG_TINT[flag].bg, FLAG_TINT[flag].fg),
        className,
      )}
    >
      {flag}
    </span>
  );
}

export function FieldFlags({ flags, className }: { flags: FieldFlag[]; className?: string }) {
  if (flags.length === 0) return null;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {flags.map((flag) => (
        <FieldFlagChip key={flag} flag={flag} />
      ))}
    </span>
  );
}

/**
 * The editable form of `FieldFlagChip`: a click toggles the flag instead of
 * only displaying it. Off carries the flag's own colour muted down to a
 * border, rather than switching to a generic on/off control — the same chip
 * you'd see in read mode, just interactive.
 *
 * ARR/UQ switch to their own tint on activation rather than the read-mode
 * `flag-neutral` grey — that grey reads fine as a settled badge, but next to
 * the same grey border it was just toggled from, "on" wasn't visibly
 * different from "off", and ARR/UQ need to stay distinguishable from each
 * other too, not just from "off". PII keeps its own warm tint either way,
 * since that one already carries colour at rest.
 */
export function FlagToggleChip({
  flag,
  active,
  disabled,
  onToggle,
  className,
}: {
  flag: FieldFlag;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={FLAG_TITLES[flag]}
      aria-pressed={active}
      aria-label={FLAG_TITLES[flag]}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex h-[26px] min-w-[36px] items-center justify-center rounded border px-2 text-[10.5px] font-bold tracking-wide transition-colors",
        active
          ? flag === "PII"
            ? "border-flag-pii-bg bg-flag-pii-bg text-flag-pii-fg"
            : cn(FLAG_TINT[flag].border, FLAG_TINT[flag].bg, FLAG_TINT[flag].fg)
          : "border-border/50 text-muted-foreground/50",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/40",
        className,
      )}
    >
      {flag}
    </button>
  );
}
