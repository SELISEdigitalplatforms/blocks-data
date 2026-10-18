import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { TextCursorInput } from "lucide-react";
import type { IFieldDefaultValue } from "../../models/data-service";
import { LOCKED_DEFAULT_PROPERTIES, canHaveDefault, formatDefaultSummary } from "../../utils/default-value.util";

/** Why a field can't take a default, or null when it can. */
function unavailableReason(fieldName: string, fieldType: string, isNewField: boolean, isEditMode: boolean): string | null {
  if (isEditMode) return "Exit edit mode to manage the default value";
  if (isNewField) return "Save the field before setting a default value";
  if (LOCKED_DEFAULT_PROPERTIES.includes(fieldName)) return `${fieldName} is set by the platform on every save`;
  if (!canHaveDefault(fieldName, fieldType)) return "Default values are only available for text, number, true/false, date-time and enum properties";
  return null;
}

/**
 * The Rules column's third button, after Access and Validation: opens the field's default value.
 * Tinted once a default is set, like Validation once it has rules.
 */
export function DefaultValueButton({
  fieldName,
  fieldType,
  isNewField,
  isEditMode = false,
  defaultValue,
  wide = false,
  onOpen,
}: Readonly<{
  fieldName: string;
  fieldType: string;
  isNewField: boolean;
  isEditMode?: boolean;
  defaultValue: IFieldDefaultValue | null;
  /** The mobile card's full-width form. */
  wide?: boolean;
  onOpen: () => void;
}>) {
  const reason = unavailableReason(fieldName, fieldType, isNewField, isEditMode);
  const summary = defaultValue ? formatDefaultSummary(defaultValue) : null;
  const shape = wide
    ? "flex w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm"
    : "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border";
  const iconClass = wide ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5";
  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled
            className={cn(shape, "cursor-not-allowed border-border/60 text-muted-foreground/50")}
            aria-label={reason}
          >
            <TextCursorInput className={iconClass} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            shape,
            "transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
            defaultValue
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
          aria-label={summary ? `Default value for ${fieldName} (${summary})` : `Default value for ${fieldName}`}
        >
          <TextCursorInput className={iconClass} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{summary ? `Default value: ${summary}` : "Set a default value"}</TooltipContent>
    </Tooltip>
  );
}
