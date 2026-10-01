import { Button } from "@/components/ui-kits/button/button";
import { AlertTriangle } from "lucide-react";

import { describeChange, type SchemaDiff } from "../../utils/schema-diff";

interface SchemaDirtyBarProps {
  /** Save submits the surrounding form unless a click handler is supplied. */
  onSave?: () => void;
  isValid: boolean;
  diff: SchemaDiff;
}

/**
 * Unsaved-changes footer for the fields table.
 *
 * This was a four-line warning block above the table that appeared the moment
 * you touched a field and pushed every row down to make room — so the act of
 * editing moved the thing you were editing. It sits under the table now, next
 * to the button it is warning you about.
 *
 * The count and the summary come from the row-identity diff rather than from
 * React Hook Form's dirty flags: removing a row marks every later row dirty,
 * which would put a wrong number in front of the reader.
 */
export function SchemaDirtyBar({ onSave, isValid, diff }: SchemaDirtyBarProps) {
  const summary = diff.changes.map(describeChange).join(" · ");

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border/50 bg-muted/30 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-base-warning" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">
          {diff.count === 1 ? "1 unsaved change" : `${diff.count} unsaved changes`}
        </p>
        <p className="truncate text-[11px] text-muted-foreground" title={summary || undefined}>
          {summary ||
            "Schema properties are used across the application; changing them affects everywhere they appear."}
        </p>
      </div>
      <div className="flex-1" />
      <Button
        size="sm"
        type={onSave ? "button" : "submit"}
        disabled={!isValid}
        onClick={onSave}
      >
        Save
      </Button>
    </div>
  );
}
