import { cn } from "@/lib/utils";

import type { RequiredOn } from "../../models/data-service";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

/**
 * IsRequired is an enum, not a boolean — None | Insert | Update | Both. It is
 * rendered as a value rather than a toggle so that Insert and Update stay
 * distinguishable at a glance.
 */
const LABELS: Record<RequiredOn, string> = {
  None: "—",
  get Insert() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.INSERT"); },
  get Update() { return tStatic("data.gateway.schema", "common:UPDATE"); },
  get Both() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.BOTH"); },
};

const TITLES: Record<RequiredOn, string> = {
  get None() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.NEVER_REQUIRED"); },
  get Insert() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.REQUIRED_WHEN_THE_RECORD_IS_CREATED"); },
  get Update() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.REQUIRED_WHEN_THE_RECORD_IS_UPDATED"); },
  get Both() { return tStatic("data.gateway.schema", "REQUIRED_BADGE.REQUIRED_ON_CREATE_AND_UPDATE"); },
};

export function RequiredBadge({
  requiredOn,
  className,
}: {
  requiredOn?: RequiredOn | null;
  className?: string;
}) {
  const value: RequiredOn = requiredOn ?? "None";
  const isNone = value === "None";

  return (
    <span
      title={TITLES[value]}
      className={cn("text-xs", isNone ? "text-muted-foreground/60" : "text-foreground", className)}
    >
      {LABELS[value]}
    </span>
  );
}
