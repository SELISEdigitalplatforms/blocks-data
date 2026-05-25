import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { Input } from "@/components/ui-kits/input/input";
import { Switch } from "@/components/ui-kits/switch/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { useId } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  MoreVertical,
  TicketCheck,
  TicketSlash,
  Trash,
  UserRoundPlus,
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
import {
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_TYPE_SHORT_LABELS,
  ACCESS_TYPES,
} from "@/data-gateway/constants/schema-access-control";
import { getValidationDisplayInfo } from "@/data-gateway/utils/schema-normalization";
import { findChildSchemaByType } from "@/data-gateway/utils/schema-structure.utils";

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
  totalFields: number;
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
  totalFields,
  showAccessColumn = true,
  showAccessValidationColumn = true,
  originalFieldFromSchema,
  isNestedAttributePanel = false,
}: SchemaMobileCardProps) {
  const [isReadonlyExpanded, setIsReadonlyExpanded] = useReadonlyExpanded();
  const isArraySwitchId = useId();
  const isPIISwitchId = useId();
  const isUniqueSwitchId = useId();
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
  const currentType = watch(`properties.${index}.type`);
  const isPrimitiveType = typeOptions.includes(currentType);
  const resolvedChildSchema = childSchema ?? findChildSchemaByType(schemaItems, currentType);
  const isChildType = Boolean(resolvedChildSchema);

  // For entity type schemas, show section headers and handle collapse
  const isEntityType = schemaType === 1;
  const readonlyFieldsCount = isEntityType
    ? properties.filter((p) => readonlyPropertyNames.includes(p.name)).length
    : 0;
  const isFirstRow = isEntityType && index === 0;
  const isFirstCustomField = isEntityType && index === readonlyFieldsCount;
  const customFieldsCount = isEntityType ? totalFields - readonlyFieldsCount : 0;

  return (
    <>
      {/* Readonly Properties Section Header - Always show at index 0 for entity types */}
      {isFirstRow && (
        <div className="rounded-lg bg-muted/30 px-4 py-3">
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

      {/* Custom Properties Section Header */}
      {isFirstCustomField && (
        <div className="rounded-lg bg-muted/30 px-4 py-3">
          <div className="text-sm font-medium text-foreground">
            {schemaName} Properties ({customFieldsCount})
          </div>
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
                <Input
                  {...register(`properties.${index}.name`, {
                    required: "Property name is required",
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
                    const filtered = e.target.value.replace(/[^a-zA-Z]/g, "");
                    setValue(`properties.${index}.name`, filtered, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  className={cn(
                    "w-full min-w-0",
                    isEditMode && isReadOnly ? "cursor-not-allowed bg-muted opacity-50" : "",
                    errors.properties?.[index]?.name ? "border-red-500" : "",
                  )}
                />
                {errors.properties?.[index]?.name && (
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
                  <div
                    className={cn(
                      "flex h-[37px] w-full items-center gap-1.5 rounded-md border px-3 text-sm",
                      isChildType
                        ? "border-primary/50 bg-primary/5 font-medium text-primary"
                        : "bg-background text-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {watch(`properties.${index}.type`) || "Select type..."}
                    </span>
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

              {/* IsArray */}
              <div className="flex min-h-[35px] items-center justify-between gap-3">
                <label
                  htmlFor={isArraySwitchId}
                  className={cn(
                    "min-w-0 text-xs text-muted-foreground",
                    isEditMode && !isReadOnly ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  IsArray
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center",
                        (!isEditMode || isReadOnly) && "cursor-not-allowed",
                      )}
                    >
                      <Switch
                        id={isArraySwitchId}
                        checked={watch(`properties.${index}.isArray`) === true}
                        onCheckedChange={(checked) =>
                          setValue(`properties.${index}.isArray`, checked, {
                            shouldDirty: true,
                          })
                        }
                        disabled={!isEditMode || isReadOnly}
                        size="sm"
                        aria-label={`IsArray for ${name || "property"}`}
                        className={cn(
                          (!isEditMode || isReadOnly) && "pointer-events-none opacity-70",
                        )}
                      />
                    </span>
                  </TooltipTrigger>
                  {(!isEditMode || isReadOnly) && (
                    <TooltipContent>
                      {isReadOnly
                        ? "IsArray is read-only for default properties"
                        : "Click edit to change"}
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>

              {/* IsPII */}
              <div className="flex min-h-[35px] items-center justify-between gap-3">
                <label
                  htmlFor={isPIISwitchId}
                  className={cn(
                    "min-w-0 text-xs text-muted-foreground",
                    isEditMode && !isReadOnly && !isChildType ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  IsPII
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center",
                        (!isEditMode || isReadOnly || isChildType) && "cursor-not-allowed",
                      )}
                    >
                      <Switch
                        id={isPIISwitchId}
                        checked={watch(`properties.${index}.isPIIData`) === true}
                        onCheckedChange={(checked) =>
                          setValue(`properties.${index}.isPIIData`, checked, {
                            shouldDirty: true,
                          })
                        }
                        disabled={!isEditMode || isReadOnly || isChildType}
                        size="sm"
                        aria-label={`IsPII for ${name || "property"}`}
                        className={cn(
                          (!isEditMode || isReadOnly || isChildType) &&
                            "pointer-events-none opacity-70",
                        )}
                      />
                    </span>
                  </TooltipTrigger>
                  {(!isEditMode || isReadOnly || isChildType) && (
                    <TooltipContent>
                      {isChildType
                        ? "IsPII is not applicable for child types"
                        : isReadOnly
                          ? "IsPII is read-only for default properties"
                          : "Click edit to change"}
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>

              {/* IsUnique */}
              <div className="flex min-h-[35px] items-center justify-between gap-3">
                <label
                  htmlFor={isUniqueSwitchId}
                  className={cn(
                    "min-w-0 text-xs text-muted-foreground",
                    isEditMode && !isReadOnly && !isChildType ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  IsUnique
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center",
                        (!isEditMode || isReadOnly || isChildType) && "cursor-not-allowed",
                      )}
                    >
                      <Switch
                        id={isUniqueSwitchId}
                        checked={watch(`properties.${index}.isUniqueData`) === true}
                        onCheckedChange={(checked) =>
                          setValue(`properties.${index}.isUniqueData`, checked, {
                            shouldDirty: true,
                          })
                        }
                        disabled={!isEditMode || isReadOnly || isChildType}
                        size="sm"
                        aria-label={`IsUnique for ${name || "property"}`}
                        className={cn(
                          (!isEditMode || isReadOnly || isChildType) &&
                            "pointer-events-none opacity-70",
                        )}
                      />
                    </span>
                  </TooltipTrigger>
                  {(!isEditMode || isReadOnly || isChildType) && (
                    <TooltipContent>
                      {isChildType
                        ? "isUniqueData is not applicable for child types"
                        : isReadOnly
                          ? "isUniqueData is read-only for default properties"
                          : "Click edit to change"}
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>

              {/* Description */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs text-muted-foreground">Description</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input
                      value={watch(`properties.${index}.description`) ?? ""}
                      onChange={(e) =>
                        setValue(`properties.${index}.description`, e.target.value, {
                          shouldDirty: true,
                        })
                      }
                      placeholder={isEditMode && !isReadOnly ? "Add description" : "—"}
                      readOnly={!isEditMode || isReadOnly}
                      className={cn(
                        "w-full min-w-0",
                        isEditMode && isReadOnly ? "cursor-not-allowed bg-muted opacity-50" : "",
                      )}
                    />
                  </TooltipTrigger>
                  {!isEditMode && watch(`properties.${index}.description`) && (
                    <TooltipContent className="max-w-xs break-words">
                      {watch(`properties.${index}.description`)}
                    </TooltipContent>
                  )}
                </Tooltip>
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
                              <UserRoundPlus className="h-4 w-4 shrink-0" />
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
                              className="flex w-full min-w-0 items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              aria-label={`View access for ${fieldTarget?.name || schemaName}`}
                            >
                              <UserRoundPlus className="h-4 w-4 shrink-0" />
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
                            <TicketSlash className="h-4 w-4 shrink-0" />
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
                        className="flex w-full min-w-0 items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-label={`Manage validations for ${fieldName}`}
                      >
                        {validationInfo.total > 0 ? (
                          <TicketCheck
                            className={cn(
                              "h-4 w-4 shrink-0",
                              validationInfo.hasActive && "text-green-500",
                            )}
                          />
                        ) : (
                          <TicketSlash className="h-4 w-4 shrink-0" />
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
                  <Button variant="ghost" className="h-8 w-8 shrink-0 p-0">
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
