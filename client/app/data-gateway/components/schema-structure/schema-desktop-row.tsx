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
import { TableCell, TableRow } from "@/components/ui-kits/table/table";
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

/**
 * The three genuine booleans on a property, as one column.
 *
 * They used to be three columns of switches that stayed on screen in view mode
 * looking like controls you could touch, each with a tooltip explaining why you
 * could not. The aria-labels are unchanged so the edit-mode contract holds.
 */
const FLAG_SWITCHES = [
  { key: "isArray", label: "ARR", title: "IsArray", notForChildTypes: false },
  { key: "isPIIData", label: "PII", title: "IsPII", notForChildTypes: true },
  { key: "isUniqueData", label: "UQ", title: "IsUnique", notForChildTypes: true },
] as const;

interface SchemaDesktopRowProps {
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
  openTypePopoverIndex: number | null;
  setOpenTypePopoverIndex: (index: number | null) => void;
  schemaItems: ISchemaDetails[];
  onTypeSearchChange: (value: string) => void;
  searchText: string;
  onOpenAccessDrawer: (fieldTarget: FieldAccessTarget | undefined, title: string) => void;
  onOpenValidationDrawer: (fieldName: string, validationRule?: IFieldValidationRule | null) => void;
  isExpanded?: boolean;
  onToggleExpand?: (index: number) => void;
  childSchema?: ISchemaDetails | null;
  totalFields: number;
  totalFieldsLength: number;
  /** Show Access column (false only when Child schema viewed directly in Child tab) */
  showAccessColumn?: boolean;
  /** Show Access | Validation column (false in Child tab = 3-column layout) */
  showAccessValidationColumn?: boolean;
  /** Total visible desktop columns including optional checkbox/access columns */
  visibleColumnCount: number;
  /** Original field from schema API (fallback for nested validation count when form strips it) */
  originalFieldFromSchema?: IField | null;
}

export function SchemaDesktopRow({
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
  openTypePopoverIndex,
  setOpenTypePopoverIndex,
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
  totalFieldsLength,
  showAccessColumn = true,
  showAccessValidationColumn = true,
  visibleColumnCount,
  originalFieldFromSchema,
}: SchemaDesktopRowProps) {
  const compactCellClass = "py-3 align-middle";
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
  const description = watch(`properties.${index}.description`) ?? "";
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
  const isRowVisible =
    (!isEntityType || !isReadOnly || isReadonlyExpanded) && (totalFieldsLength > 0 || isEditMode);
  return (
    <>
      {/* Readonly Properties Section Header - Always show at index 0 for entity types */}
      {isFirstRow && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={visibleColumnCount} className="bg-muted/30 px-4 py-2">
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
          </TableCell>
        </TableRow>
      )}
      {/* Custom Properties Section Header */}
      {isFirstCustomField && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={visibleColumnCount} className="bg-muted/30 px-4 py-2">
            <div className="text-sm font-medium text-foreground">
              {schemaName} Properties ({customFieldsCount})
            </div>
          </TableCell>
        </TableRow>
      )}
      {/* Only render the row if not collapsed OR if not readonly */}
      {isRowVisible && (
        <TableRow key={field.name}>
          {isEditMode && (
            <TableCell className={compactCellClass}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Checkbox
                      checked={!!selectedRows[field.id]}
                      onCheckedChange={(value) => onRowSelect(field.id, value === true)}
                      disabled={isNewField}
                      aria-label={`Select ${name || "property"}`}
                    />
                  </div>
                </TooltipTrigger>
                {isNewField && <TooltipContent>Save the field before selecting</TooltipContent>}
              </Tooltip>
            </TableCell>
          )}

          {/* Property */}
          <TableCell className={compactCellClass}>
            {!isEditMode ? (
              <span
                className="block truncate font-mono text-[13px] text-foreground"
                title={name}
              >
                {name}
              </span>
            ) : (
            <div className="flex h-9 flex-col justify-center gap-0.5">
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
                  isEditMode && isReadOnly ? "cursor-not-allowed bg-muted opacity-50" : "",
                  errors.properties?.[index]?.name ? "border-red-500" : "",
                )}
              />
              {errors.properties?.[index]?.name?.message && (
                <p className="text-xs leading-4 text-red-500">
                  {errors.properties?.[index]?.name?.message}
                </p>
              )}
            </div>
            )}
          </TableCell>

          {/* Property Type */}
          <TableCell className={compactCellClass}>
            <div className="flex h-9 flex-col justify-center">
              <div className="flex min-w-0 items-center gap-1.5">
                {!isEditMode ? (
                  <TypeChip
                    type={currentType}
                    isArray={watch(`properties.${index}.isArray`)}
                    className="min-w-0 max-w-full truncate"
                  />
                ) : (
                <div className="min-w-0 flex-1">
                  <PropertyTypeSelector
                    index={index}
                    value={watch(`properties.${index}.type`)}
                    isOpen={openTypePopoverIndex === index}
                    onOpenChange={(open) => {
                      if (!open) {
                        setOpenTypePopoverIndex(null);
                      } else if (isEditMode && !isReadOnly) {
                        setOpenTypePopoverIndex(index);
                      }
                    }}
                    onSelect={(type) => {
                      setValue(`properties.${index}.type`, type, { shouldDirty: true });
                      setOpenTypePopoverIndex(null);
                    }}
                    isReadOnly={isReadOnly}
                    isEditMode={isEditMode}
                    schemaItems={schemaItems}
                    onSearchChange={onTypeSearchChange}
                    searchText={searchText}
                    isChildType={isChildType}
                  />
                </div>
                )}
                {!isEditMode && isChildType && resolvedChildSchema && onToggleExpand && (
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
            </div>
          </TableCell>

          {/* Required */}
          <TableCell className={compactCellClass}>
              {!isEditMode ? (
                isPrimitiveType ? (
                  <RequiredBadge requiredOn={watch(`properties.${index}.requiredOn`)} />
                ) : null
              ) : isPrimitiveType && <Select
                value={watch(`properties.${index}.requiredOn`) ?? "None"}
                onValueChange={(value) => setValue(`properties.${index}.requiredOn`, value as IField["requiredOn"], { shouldDirty: true })}
                disabled={!isEditMode || isReadOnly}
              >
                <SelectTrigger aria-label={`IsRequired for ${name || "property"}`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["None", "Insert", "Update", "Both"] as const).map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                </SelectContent>
              </Select>}
          </TableCell>

          {/* Flags */}
          <TableCell className={compactCellClass}>
            {!isEditMode ? (
              // Every board shows ARR as its own chip even when the type chip
              // already carries a name (Address, OrderItem) — the type name
              // alone doesn't say "array" for non-primitive types, so this
              // can't be dropped as redundant.
              <FieldFlags
                flags={flagsFromField({
                  isArray: watch(`properties.${index}.isArray`),
                  isPIIData: watch(`properties.${index}.isPIIData`),
                  isUniqueData: watch(`properties.${index}.isUniqueData`),
                })}
              />
            ) : (
              <div className="flex h-9 items-center gap-1.5">
                {FLAG_SWITCHES.map(({ key, label, title, notForChildTypes }) => {
                  const disabled = isReadOnly || (notForChildTypes && isChildType);
                  const chip = (
                    <FlagToggleChip
                      flag={label}
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
                          ? `${title} is not applicable for child types`
                          : `${title} is read-only for default properties`}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </TableCell>

          {/* Description */}
          <TableCell className={cn(compactCellClass, "px-3 md:px-3")}>
            {!isEditMode ? (
              <span
                className={cn(
                  "block truncate text-xs",
                  description ? "text-muted-foreground" : "text-muted-foreground/40",
                )}
                title={description || undefined}
              >
                {description || "—"}
              </span>
            ) : (
              <div className="flex h-9 min-w-0 flex-col justify-center">
                <Input
                  value={description}
                  onChange={(e) =>
                    setValue(`properties.${index}.description`, e.target.value, {
                      shouldDirty: true,
                    })
                  }
                  placeholder={isReadOnly ? "—" : "Add description"}
                  readOnly={isReadOnly}
                  className={cn("min-w-0", isReadOnly && "cursor-not-allowed bg-muted opacity-50")}
                />
              </div>
            )}
          </TableCell>

          {/* Rules (hidden in Child tab, and in edit mode where it does nothing) */}
          {!isEditMode && showAccessValidationColumn && (
            <TableCell className={compactCellClass}>
              <div className="flex h-9 items-center gap-1">
                {showAccessColumn && (
                  <>
                    {isNewField || !isPrimitiveType ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed p-1 text-muted-foreground opacity-50"
                            aria-label={
                              isNewField
                                ? "Save the field before setting access"
                                : "Access is not available for custom property types"
                            }
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isNewField
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
                            className="p-1 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            aria-label={`View access for ${fieldTarget?.name || schemaName}`}
                          >
                            <Shield
                              className={cn("h-4 w-4", hasNonInheritedPolicy && "text-green-500")}
                            />
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
                    )}
                    <span className="select-none text-muted-foreground">|</span>
                  </>
                )}

                {isNewField || !isPrimitiveType ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed p-1 text-muted-foreground opacity-50"
                        aria-label={
                          isNewField
                            ? "Save the field before adding validations"
                            : "Validations are only available for primitive types"
                        }
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isNewField
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
                      "flex items-center gap-1 rounded p-1 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      validationInfo.hasActive ? "text-green-500" : "text-foreground",
                    )}
                    aria-label={`Manage validations for ${fieldName}${validationInfo.total > 0 ? ` (${validationInfo.total})` : ""}`}
                  >
                    <Check className="h-4 w-4" />
                    {validationInfo.total > 0 && (
                      <span aria-hidden className="text-[11px] font-semibold">
                        {validationInfo.total}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </TableCell>
          )}

          {/* Actions */}
          {isEditMode && (
          <TableCell className="py-1 text-right align-middle md:py-1.5">
            {!isReadOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-5 w-5 p-0"
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
          </TableCell>
          )}
        </TableRow>
      )}
    </>
  );
}
