import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { RectangleEllipsis } from "lucide-react";
import type { IFieldDefaultValue } from "../../models/data-service";
import { LOCKED_DEFAULT_PROPERTIES, canHaveDefault, formatDefaultSummary } from "../../utils/default-value.util";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/** Why a field can't take a default, or null when it can. */
function unavailableReason(fieldName: string, fieldType: string, isNewField: boolean, isEditMode: boolean): string | null {
  if (isEditMode) return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "DEFAULT_VALUE_BUTTON.EXIT_EDIT_MODE_TO_MANAGE_THE");
  if (isNewField) return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "DEFAULT_VALUE_BUTTON.SAVE_THE_FIELD_BEFORE_SETTING_A");
  if (LOCKED_DEFAULT_PROPERTIES.includes(fieldName)) return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "DEFAULT_VALUE_BUTTON.FIELDNAME_IS_SET_BY_THE_PLATFORM", { fieldName });
  if (!canHaveDefault(fieldName, fieldType)) return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "DEFAULT_VALUE_BUTTON.DEFAULT_VALUES_ARE_ONLY_AVAILABLE_FOR");
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
  active = false,
  onOpen,
}: Readonly<{
  fieldName: string;
  fieldType: string;
  isNewField: boolean;
  isEditMode?: boolean;
  defaultValue: IFieldDefaultValue | null;
  /** The mobile card's full-width form. */
  wide?: boolean;
  /** Its panel is open in the docked inspector. */
  active?: boolean;
  onOpen: () => void;
}>) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
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
            <RectangleEllipsis className={iconClass} />
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
          aria-expanded={active}
          className={cn(
            shape,
            "transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
            active && "border-primary bg-primary/15 text-primary",
            !active && defaultValue && "border-primary/30 bg-primary/10 text-primary",
            !active && !defaultValue && "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
          aria-label={summary ? t("DEFAULT_VALUE_BUTTON.DEFAULT_VALUE_FOR_FIELDNAME_SUMMARY", { fieldName, summary }) : t("DEFAULT_VALUE_BUTTON.DEFAULT_VALUE_FOR_FIELDNAME", { fieldName })}
        >
          <RectangleEllipsis className={iconClass} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{summary ? t("DEFAULT_VALUE_BUTTON.DEFAULT_VALUE_SUMMARY", { summary }) : t("DEFAULT_VALUE_BUTTON.SET_A_DEFAULT_VALUE")}</TooltipContent>
    </Tooltip>
  );
}
