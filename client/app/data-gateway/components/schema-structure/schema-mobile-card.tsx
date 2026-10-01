import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { Input } from "@/components/ui-kits/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MoreVertical,
  Shield,
  Trash,
} from "lucide-react";
import {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
  FieldArrayWithId,
} from "react-hook-form";
import { FieldAccessTarget } from "../../models/schema-access.types";
import { IField, IDataAccessRuleSet, IFieldValidationRule } from "../../models/data-service";
import { PropertyRow } from "../../models/schema-structure.types";
import { PropertyTypeSelector } from "./property-type-selector";
import { ISchemaDetails } from "../../models/data-service";
import { useReadonlyExpanded } from "../../hooks/use-readonly-expanded";
import {
  readonlyPropertyNames,
  typeOptions,
} from "@/data-gateway/constants/input-restrictions";
import { allowLettersNumbersUnderscoreKeyDown, SCHEMA_NAME_ALLOWED_PATTERN } from "@/data-gateway/utils/input-restriction.util";
import {
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_TYPE_SHORT_LABELS,
  ACCESS_TYPES,
} from "@/data-gateway/constants/schema-access-control";
import { getValidationDisplayInfo } from "@/data-gateway/utils/schema-normalization";
import { findChildSchemaByType } from "@/data-gateway/utils/schema-structure.utils";
import { FieldFlags, FlagToggleChip, RequiredBadge, TypeChip, flagsFromField } from "../primitives";

const FLAG_TOGGLES = [
  { flag: "ARR", key: "isArray", notForChildTypes: false },
  { flag: "PII", key: "isPIIData", notForChildTypes: true },
  { flag: "UQ", key: "isUniqueData", notForChildTypes: true },
] as const;

interface SchemaMobileCardProps {
  field: FieldArrayWithId<{ properties: IField[] }, "properties", "id">;
  index: number;
  isEditMode: boolean;
  isReadOnly: boolean;
  isNewField: boolean;
  selectedRows: Record<string, boolean>;
  onRowSelect: (fieldId: string, selected: boolean) => void;
  register: UseFormRegister<{ properties: IField[] }>;
  watch: UseFormWatch<{ properties: IField[] }>;
  setValue: UseFormSetValue<{ properties: IField[] }>;
  errors: FieldErrors<{ properties: IField[] }>;
  properties: PropertyRow[];
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  schemaId: string;
  schemaName: string;
  schemaType: number;
  schemaReadAccess?: IDataAccessRuleSet;
  schemaWriteAccess?: IDataAccessRuleSet;
  schemaDeleteAccess?: IDataAccessRuleSet;
  openMobileTypePopoverIndex: number | null;
  setOpenMobileTypePopoverIndex: (index: number | null) => void;
  schemaItems: ISchemaDetails[];
  onTypeSearchChange: (value: string) => void;
  searchText: string;
  onOpenAccessDrawer: (fieldTarget: FieldAccessTarget | undefined, title: string) => void;
  onOpenValidationDrawer: (fieldName: string, validationRule?: IFieldValidationRule | null) => void;
  isExpanded?: boolean;
  onToggleExpand?: (index: number) => void;
  childSchema?: ISchemaDetails | null;
  /** Show Access column (false only when Child schema viewed directly in Child tab) */
  showAccessColumn?: boolean;
  /** Show Access | Validation column (false in Child tab = 3-column layout) */
  showAccessValidationColumn?: boolean;
  /** Original field from schema API (fallback for nested validation count) */
  originalFieldFromSchema?: IField | null;
  /** True when this card is inside an embedded child schema panel (mobile visual tier) */
  isNestedAttributePanel?: boolean;
}

export function SchemaMobileCard({
  field,
  index,
  isEditMode,
  isReadOnly,
  isNewField,
  selectedRows,
  onRowSelect,
  register,
  watch,
  setValue,
  errors,
  properties,
  onDuplicate,
  onDelete,
  schemaId: _schemaId,
  schemaName,
  schemaReadAccess: _schemaReadAccess,
  schemaWriteAccess: _schemaWriteAccess,
  schemaDeleteAccess: _schemaDeleteAccess,
  openMobileTypePopoverIndex,
  setOpenMobileTypePopoverIndex,
  schemaItems,
  onTypeSearchChange,
  searchText,
  onOpenAccessDrawer,
  onOpenValidationDrawer,
  isExpanded,
  onToggleExpand,
  childSchema,
  schemaType,
  showAccessColumn = true,
  showAccessValidationColumn = true,
  originalFieldFromSchema,
  isNestedAttributePanel = false,
}: SchemaMobileCardProps) {
  const [isReadonlyExpanded, setIsReadonlyExpanded] = useReadonlyExpanded();
  const name = watch(`properties.${index}.name`);
  const propertyValue = (properties?.[index] ?? null) as IField | null;
  const fieldSource = (propertyValue ?? (field as unknown as IField)) || undefined;
  const fieldName = (fieldSource?.name || name || "").trim();
  const fieldForValidation = fieldSource?.fields?.length
    ? fieldSource
    : (originalFieldFromSchema ?? fieldSource);
  const validationInfo = getValidationDisplayInfo(fieldForValidation);

  const fieldTarget: FieldAccessTarget | undefined = fieldName
    ? {
        name: fieldName,
        readAccess: fieldSource?.readAccess,
        writeAccess: fieldSource?.writeAccess,
        deleteAccess: fieldSource?.deleteAccess,
      }
    : undefined;

  const drawerTitle = fieldName ? `Access for ${fieldName}` : `Access for ${schemaName}`;

  const hasNonInheritedPolicy = [
    fieldSource?.readAccessLevel,
    fieldSource?.writeAccessLevel,
    fieldSource?.editAccessLevel,
  ].some(
    (level) =>
      (ACCESS_LEVEL_TO_TYPE[level ?? 0] ?? ACCESS_TYPES.INHERITED) !== ACCESS_TYPES.INHERITED,
  );
  const currentType = watch(`properties.${index}.type`);
  const isPrimitiveType = typeOptions.includes(currentType);
  const resolvedChildSchema = childSchema ?? findChildSchemaByType(schemaItems, currentType);
  const isChildType = Boolean(resolvedChildSchema);

  // For entity type schemas, show section headers and handle collapse
  const isEntityType = schemaType === 1;
  const readonlyFieldsCount = isEntityType
    ? properties.filter((p) => readonlyPropertyNames.includes(p.name)).length
    : 0;
  const description = watch(`properties.${index}.description`) ?? "";
  // Every board shows ARR as its own chip even when the type chip already
  // carries a name (Address, OrderItem) — the type name alone doesn't say
  // "array" for non-primitive types, so this can't be dropped as redundant.
  const fieldFlags = flagsFromField({
    isArray: watch(`properties.${index}.isArray`),
    isPIIData: watch(`properties.${index}.isPIIData`),
    isUniqueData: watch(`properties.${index}.isUniqueData`),
  });
  const isFirstRow = isEntityType && index === 0;

  return (
    <>
      {/* Readonly Properties Section Header - Always show at index 0 for entity types */}
      {isFirstRow && (
        <div className="rounded-lg bg-primary/5 px-4 py-3">
          <button
            type="button"
            onClick={() => setIsReadonlyExpanded(!isReadonlyExpanded)}
            className="flex w-full items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isReadonlyExpanded ? "rotate-0" : "-rotate-90",
              )}
            />
            <span>Default Properties ({readonlyFieldsCount})</span>
          </button>
        </div>
      )}

      {/* Only render the card if not collapsed OR if not readonly */}
      {(!isEntityType || !isReadOnly || isReadonlyExpanded) && (
        <div
          key={field.id}
          className={cn(
            "rounded-lg border p-4",
            isNestedAttributePanel
              ? "border-dashed border-border/80 bg-card shadow-sm dark:border-border"
              : "border-border bg-card shadow-sm",
            isReadOnly && isEntityType && !isNestedAttributePanel && "bg-primary/5",
            isExpanded &&
              childSchema &&
              !isNestedAttributePanel &&
              "ring-2 ring-primary/20 dark:ring-primary/35",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            {isEditMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="shrink-0">
                    <Checkbox
                      checked={!!selectedRows[field.id]}
                      onCheckedChange={(value) => onRowSelect(field.id, value === true)}
                      disabled={isNewField}
                      aria-label={`Select ${name || "property"}`}
                      className="mt-1"
                    />
                  </div>
                </TooltipTrigger>
                {isNewField && <TooltipContent>Save the field before selecting</TooltipContent>}
              </Tooltip>
            )}

            <div className="min-w-0 flex-1 space-y-4">
              {/* Property Name */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs text-muted-foreground">Property name</label>
                {!isEditMode ? (
                  <p className="truncate font-mono text-sm text-foreground" title={name}>
                    {name}
                  </p>
                ) : (
                <Input
                  {...register(`properties.${index}.name`, {
                    required: "Property name is required",
                    pattern: {
                      value: SCHEMA_NAME_ALLOWED_PATTERN,
                      message:
                        "Only letters, numbers, and '_' are allowed. Cannot start with a number.",
                    },
                    validate: (value) => {
                      const allNames = properties.map((p) => p.name.trim().toLowerCase());
                      const occurrences = allNames.filter(
                        (n) => n === value.trim().toLowerCase(),
                      ).length;
                      return occurrences <= 1 || "Duplicate property name not allowed";
                    },
                  })}
                  placeholder="Click to edit"
                  readOnly={!isEditMode || isReadOnly}
                  onChange={(e) => {
                    const filtered = e.target.value
                      .replace(/[^A-Za-z0-9_]/g, "")
                      .replace(/^[0-9]+/, "");
                    setValue(`properties.${index}.name`, filtered, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    const filtered = pasted
                      .replace(/[^A-Za-z0-9_]/g, "")
                      .replace(/^[0-9]+/, "");
                    if (filtered !== pasted) {
                      e.preventDefault();
                      const target = e.target as HTMLInputElement;
                      const newValue =
                        target.value.slice(0, target.selectionStart ?? target.value.length) +
                        filtered +
                        target.value.slice(target.selectionEnd ?? target.value.length);
                      setValue(`properties.${index}.name`, newValue, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                  }}
                  onKeyDown={allowLettersNumbersUnderscoreKeyDown}
                  className={cn(
                    "w-full min-w-0",
                    isEditMode && isReadOnly ? "cursor-not-allowed bg-muted opacity-50" : "",
                    errors.properties?.[index]?.name ? "border-red-500" : "",
                  )}
                />
                )}
                {isEditMode && errors.properties?.[index]?.name && (
                  <p className="text-xs text-red-500">
                    {errors.properties?.[index]?.name?.message}
                  </p>
                )}
              </div>

              {/* Property Type */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs text-muted-foreground">Property type</label>
                {isEditMode ? (
                  <PropertyTypeSelector
                    index={index}
                    value={watch(`properties.${index}.type`)}
                    isOpen={openMobileTypePopoverIndex === index}
                    onOpenChange={(open) => {
                      if (!open) {
                        setOpenMobileTypePopoverIndex(null);
                      } else if (isEditMode && !isReadOnly) {
                        setOpenMobileTypePopoverIndex(index);
                      }
                    }}
                    onSelect={(type) => {
                      setValue(`properties.${index}.type`, type, { shouldDirty: true });
                      setOpenMobileTypePopoverIndex(null);
                    }}
                    isReadOnly={isReadOnly}
                    isEditMode={isEditMode}
                    schemaItems={schemaItems}
                    onSearchChange={onTypeSearchChange}
                    searchText={searchText}
                    isMobile={true}
                    isChildType={isChildType}
                  />
                ) : (
                  <div className="flex min-h-[28px] w-full items-center gap-1.5">
                    <TypeChip
                      type={watch(`properties.${index}.type`)}
                      isArray={watch(`properties.${index}.isArray`)}
                      className="min-w-0 max-w-full truncate"
                    />
                    {isChildType && resolvedChildSchema && onToggleExpand && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onToggleExpand(index)}
                            className={cn(
                              "flex shrink-0 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                              isExpanded
                                ? "bg-primary/10 text-primary"
                                : "text-primary hover:bg-primary/10",
                            )}
                            aria-label={
                              isExpanded
                                ? `Collapse ${resolvedChildSchema.schemaName}`
                                : `Expand ${resolvedChildSchema.schemaName} attributes`
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isExpanded ? "Collapse" : "Expand"} {resolvedChildSchema.schemaName}{" "}
                          attributes
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>

              {isPrimitiveType && (
                <div className="min-w-0 space-y-1">
                  <label className="text-xs text-muted-foreground">Required</label>
                  {!isEditMode ? (
                    <p>
                      <RequiredBadge requiredOn={watch(`properties.${index}.requiredOn`)} />
                    </p>
                  ) : (
                  <Select
                    value={watch(`properties.${index}.requiredOn`) ?? "None"}
                    onValueChange={(value) => setValue(`properties.${index}.requiredOn`, value as IField["requiredOn"], { shouldDirty: true })}
                    disabled={!isEditMode || isReadOnly}
                  >
                    <SelectTrigger aria-label={`IsRequired for ${name || "property"}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["None", "Insert", "Update", "Both"] as const).map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  )}
                </div>
              )}

              <div className="flex min-h-[35px] items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Flags</span>
                {!isEditMode ? (
                  fieldFlags.length > 0 ? (
                    <FieldFlags flags={fieldFlags} />
                  ) : (
                    <span className="text-sm text-muted-foreground/40">—</span>
                  )
                ) : (
                  <div className="flex items-center gap-1.5">
                    {FLAG_TOGGLES.map(({ flag, key, notForChildTypes }) => {
                      const disabled = isReadOnly || (notForChildTypes && isChildType);
                      const chip = (
                        <FlagToggleChip
                          flag={flag}
                          active={watch(`properties.${index}.${key}`) === true}
                          disabled={disabled}
                          onToggle={() =>
                            setValue(
                              `properties.${index}.${key}`,
                              watch(`properties.${index}.${key}`) !== true,
                              { shouldDirty: true },
                            )
                          }
                        />
                      );
                      if (!disabled) return <span key={key}>{chip}</span>;
                      return (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>{chip}</TooltipTrigger>
                          <TooltipContent>
                            {notForChildTypes && isChildType
                              ? `${flag} is not applicable for child types`
                              : `${flag} is read-only for default properties`}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Description */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs text-muted-foreground">Description</label>
                {!isEditMode ? (
                  <p
                    className={cn(
                      "break-words text-sm",
                      description ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {description || "—"}
                  </p>
                ) : (
                  <Input
                    value={description}
                    onChange={(e) =>
                      setValue(`properties.${index}.description`, e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    placeholder={isReadOnly ? "—" : "Add description"}
                    readOnly={isReadOnly}
                    className={cn(
                      "w-full min-w-0",
                      isReadOnly && "cursor-not-allowed bg-muted opacity-50",
                    )}
                  />
                )}
              </div>

              {/* Access | Validation (hidden in Child tab) */}
              {showAccessValidationColumn && (
                <div className="min-w-0 space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {showAccessColumn ? "Access | Validation" : "Validation"}
                  </label>
                  <div className="flex min-w-0 flex-col gap-2">
                    {showAccessColumn &&
                      (isEditMode || isNewField || !isPrimitiveType ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              disabled
                              className="flex w-full min-w-0 cursor-not-allowed items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              aria-label={
                                isEditMode
                                  ? "Exit edit mode to manage access"
                                  : isNewField
                                    ? "Save the field before setting access"
                                    : "Access is not available for custom property types"
                              }
                            >
                              <Shield className="h-4 w-4 shrink-0" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isEditMode
                              ? "Exit edit mode to manage access"
                              : isNewField
                                ? "Save the field before setting access"
                                : "Access is not available for custom property types"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onOpenAccessDrawer(fieldTarget, drawerTitle)}
                              className={cn(
                                "flex w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                hasNonInheritedPolicy
                                  ? "border-access-custom-border bg-access-custom-bg text-access-custom-fg"
                                  : "bg-background text-foreground hover:bg-accent",
                              )}
                              aria-label={`View access for ${fieldTarget?.name || schemaName}`}
                            >
                              <Shield className="h-4 w-4 shrink-0" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="flex items-center gap-1.5 text-xs">
                              {(
                                [
                                  { label: "View", level: fieldSource?.readAccessLevel },
                                  { label: "Create", level: fieldSource?.writeAccessLevel },
                                  { label: "Edit", level: fieldSource?.editAccessLevel },
                                ] as const
                              ).map(({ label, level }, i) => (
                                <span key={label} className="flex items-center gap-1.5">
                                  {i > 0 && <span className="text-muted-foreground">|</span>}
                                  <span className="text-muted-foreground">{label}:</span>
                                  <span>
                                    {
                                      ACCESS_TYPE_SHORT_LABELS[
                                        ACCESS_LEVEL_TO_TYPE[level ?? 0] ?? ACCESS_TYPES.INHERITED
                                      ]
                                    }
                                  </span>
                                </span>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}

                    {isEditMode || isNewField || !isPrimitiveType ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled
                            className="flex w-full min-w-0 cursor-not-allowed items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            aria-label={
                              isEditMode
                                ? "Exit edit mode to manage validations"
                                : isNewField
                                  ? "Save the field before adding validations"
                                  : "Validations are only available for primitive types"
                            }
                          >
                            <Check className="h-4 w-4 shrink-0" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isEditMode
                            ? "Exit edit mode to manage validations"
                            : isNewField
                              ? "Save the field before adding validations"
                              : "Validations are only available for primitive types"}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenValidationDrawer(fieldName, fieldForValidation?.validationRule)
                        }
                        className={cn(
                          "flex w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          validationInfo.total > 0
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "bg-background text-foreground hover:bg-accent",
                        )}
                        aria-label={`Manage validations for ${fieldName}${validationInfo.total > 0 ? ` (${validationInfo.total})` : ""}`}
                      >
                        <Check className="h-4 w-4 shrink-0" />
                        {validationInfo.total > 0 && (
                          <span aria-hidden className="text-xs font-semibold">
                            {validationInfo.total}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isEditMode && !isReadOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0"
                    aria-label={`More actions for ${name || "property"}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="cursor-pointer" onClick={() => onDuplicate(index)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Duplicate</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => onDelete(index)}>
                    <Trash className="mr-2 h-4 w-4 text-red-500" />
                    <span className="text-red-500">Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </>
  );
}
