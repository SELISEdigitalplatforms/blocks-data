import { useId, useState, type ReactNode } from "react";
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
import { IField, IDataAccessRuleSet, IFieldDefaultValue, IFieldValidationRule, ISchemaDetails } from "../../models/data-service";
import { PropertyRow } from "../../models/schema-structure.types";
import { PropertyTypeSelector } from "./property-type-selector";
import { EnumValuesEditor } from "./enum-values-editor";
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
import { PROPERTY_FIELD_CLASS } from "./property-field-styles";
import { FieldFlags, FlagToggleChip, RequiredBadge, TypeChip, flagTitlesFromField, flagsFromField } from "../primitives";
import { DefaultValueButton } from "./default-value-button";

const FLAG_TOGGLES = [
  { flag: "ARR", key: "isArray", notForChildTypes: false },
  { flag: "PII", key: "isPIIData", notForChildTypes: true },
  { flag: "UQ", key: "isUniqueData", notForChildTypes: true },
] as const;

const WIDE_BUTTON =
  "flex w-full min-w-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";
const WIDE_BUTTON_DISABLED = cn(WIDE_BUTTON, "cursor-not-allowed bg-background text-muted-foreground opacity-50");

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
  /** Opens the field's default value; the button shows only when this is given and `showDefaultButton` is on. */
  onOpenDefaultDrawer?: (fieldName: string, defaultValue?: IFieldDefaultValue | null) => void;
  /** Defaults apply on insert, so only entities (and properties nested in them) get the button. */
  showDefaultButton?: boolean;
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

/** What every field of the card reads and writes: the row in the form, and whether it may be edited. */
interface CardForm {
  index: number;
  isEditMode: boolean;
  isReadOnly: boolean;
  watch: UseFormWatch<{ properties: IField[] }>;
  setValue: UseFormSetValue<{ properties: IField[] }>;
}

/** Keeps a property name to letters, digits and "_", not starting with a digit. */
const sanitizeName = (text: string) => text.replaceAll(/\W/g, "").replace(/^\d+/, "");

const accessLabel = (level: number | undefined) =>
  ACCESS_TYPE_SHORT_LABELS[ACCESS_LEVEL_TO_TYPE[level ?? 0] ?? ACCESS_TYPES.INHERITED];

const HEADING_CLASS = "block text-xs text-muted-foreground";

/** A field's heading: a <label> for the input it names, plain text when there is no input (view mode, selects that name themselves). */
function FieldHeading({ htmlFor, children }: Readonly<{ htmlFor?: string; children: ReactNode }>) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className={HEADING_CLASS}>
      {children}
    </label>
  ) : (
    <span className={HEADING_CLASS}>{children}</span>
  );
}

/** Why a rules button can't be used: edit mode first, then an unsaved field, then the type. */
function unavailableReason(isEditMode: boolean, isNewField: boolean, typeReason: string, editReason: string, newReason: string): string | null {
  if (isEditMode) return editReason;
  if (isNewField) return newReason;
  return typeReason || null;
}

function DisabledWideButton({ reason, icon }: Readonly<{ reason: string; icon: React.ReactNode }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" disabled className={WIDE_BUTTON_DISABLED} aria-label={reason}>
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function ReadonlySectionHeader({ count }: Readonly<{ count: number }>) {
  const [isReadonlyExpanded, setIsReadonlyExpanded] = useReadonlyExpanded();
  return (
    <div className="rounded-lg bg-primary/5 px-4 py-3">
      <button
        type="button"
        onClick={() => setIsReadonlyExpanded(!isReadonlyExpanded)}
        className="flex w-full items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isReadonlyExpanded ? "rotate-0" : "-rotate-90")} />
        <span>Default Properties ({count})</span>
      </button>
    </div>
  );
}

function NameField({
  form,
  name,
  register,
  errors,
  properties,
}: Readonly<{
  form: CardForm;
  name: string;
  register: UseFormRegister<{ properties: IField[] }>;
  errors: FieldErrors<{ properties: IField[] }>;
  properties: PropertyRow[];
}>) {
  const { index, isEditMode, isReadOnly, setValue } = form;
  const nameError = errors.properties?.[index]?.name;
  const inputId = useId();
  return (
    <div className="min-w-0 space-y-1">
      <FieldHeading htmlFor={isEditMode ? inputId : undefined}>Property name</FieldHeading>
      {isEditMode ? (
        <Input
          id={inputId}
          {...register(`properties.${index}.name`, {
            required: "Property name is required",
            pattern: {
              value: SCHEMA_NAME_ALLOWED_PATTERN,
              message: "Only letters, numbers, and '_' are allowed. Cannot start with a number.",
            },
            validate: (value) => {
              const allNames = properties.map((p) => p.name.trim().toLowerCase());
              const occurrences = allNames.filter((n) => n === value.trim().toLowerCase()).length;
              return occurrences <= 1 || "Duplicate property name not allowed";
            },
          })}
          placeholder="Click to edit"
          readOnly={isReadOnly}
          onChange={(e) => {
            setValue(`properties.${index}.name`, sanitizeName(e.target.value), { shouldValidate: true, shouldDirty: true });
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            const filtered = sanitizeName(pasted);
            if (filtered === pasted) return;
            e.preventDefault();
            const target = e.target as HTMLInputElement;
            const newValue =
              target.value.slice(0, target.selectionStart ?? target.value.length) +
              filtered +
              target.value.slice(target.selectionEnd ?? target.value.length);
            setValue(`properties.${index}.name`, newValue, { shouldValidate: true, shouldDirty: true });
          }}
          onKeyDown={allowLettersNumbersUnderscoreKeyDown}
          className={cn(
            "w-full min-w-0",
            PROPERTY_FIELD_CLASS,
            isReadOnly && "cursor-not-allowed bg-muted opacity-50",
            nameError && "border-red-500",
          )}
        />
      ) : (
        <p className="truncate font-mono text-sm text-foreground" title={name}>
          {name}
        </p>
      )}
      {isEditMode && nameError && <p className="text-xs text-red-500">{nameError.message}</p>}
    </div>
  );
}

function ExpandChildButton({
  childName,
  isExpanded,
  onToggle,
}: Readonly<{ childName: string; isExpanded: boolean; onToggle: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex shrink-0 rounded p-1 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
            isExpanded ? "bg-primary/10 text-primary" : "text-primary hover:bg-primary/10",
          )}
          aria-label={isExpanded ? `Collapse ${childName}` : `Expand ${childName} attributes`}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isExpanded ? "Collapse" : "Expand"} {childName} attributes
      </TooltipContent>
    </Tooltip>
  );
}

function TypeField({
  form,
  isChildType,
  childName,
  isExpanded,
  onToggleExpand,
  isPopoverOpen,
  onPopoverChange,
  onClosePopover,
  schemaItems,
  onTypeSearchChange,
  searchText,
}: Readonly<{
  form: CardForm;
  isChildType: boolean;
  childName?: string;
  isExpanded: boolean;
  onToggleExpand?: () => void;
  isPopoverOpen: boolean;
  /** Opens the type picker (closed for a read-only property) or closes it. */
  onPopoverChange: (open: boolean) => void;
  onClosePopover: () => void;
  schemaItems: ISchemaDetails[];
  onTypeSearchChange: (value: string) => void;
  searchText: string;
}>) {
  const { index, isEditMode, isReadOnly, watch, setValue } = form;
  const [focusEnumEditor, setFocusEnumEditor] = useState(false);
  const currentType = watch(`properties.${index}.type`);

  if (!isEditMode) {
    return (
      <div className="min-w-0 space-y-1">
        <FieldHeading>Property type</FieldHeading>
        <div className="flex min-h-[28px] w-full items-center gap-1.5">
          <TypeChip type={currentType} isArray={watch(`properties.${index}.isArray`)} className="min-w-0 max-w-full truncate" />
          {isChildType && childName && onToggleExpand && (
            <ExpandChildButton childName={childName} isExpanded={isExpanded} onToggle={onToggleExpand} />
          )}
        </div>
      </div>
    );
  }

  const selectType = (type: string) => {
    setValue(`properties.${index}.type`, type, { shouldDirty: true });
    setFocusEnumEditor(type === "Enum" && currentType !== "Enum");
    const enumValues = type === "Enum" ? (watch(`properties.${index}.enumValues`) ?? []) : [];
    setValue(`properties.${index}.enumValues`, enumValues, { shouldDirty: true });
    onClosePopover();
  };

  return (
    <div className="min-w-0 space-y-1">
      <FieldHeading>Property type</FieldHeading>
      <PropertyTypeSelector
        index={index}
        value={currentType}
        isOpen={isPopoverOpen}
        onOpenChange={onPopoverChange}
        onSelect={selectType}
        isReadOnly={isReadOnly}
        isEditMode={isEditMode}
        schemaItems={schemaItems}
        onSearchChange={onTypeSearchChange}
        searchText={searchText}
        isMobile={true}
        isChildType={isChildType}
      />
      {currentType === "Enum" && (
        <EnumValuesEditor
          values={watch(`properties.${index}.enumValues`) ?? []}
          onChange={(vals) => setValue(`properties.${index}.enumValues`, vals, { shouldDirty: true })}
          disabled={isReadOnly}
          autoFocus={focusEnumEditor}
          onAutoFocused={() => setFocusEnumEditor(false)}
        />
      )}
    </div>
  );
}

function FlagsField({
  form,
  isChildType,
  defaultValue,
}: Readonly<{ form: CardForm; isChildType: boolean; defaultValue: IFieldDefaultValue | null }>) {
  const { index, isEditMode, isReadOnly, watch, setValue } = form;
  if (!isEditMode) {
    // Every board shows ARR as its own chip even when the type chip already
    // carries a name (Address, OrderItem) — the type name alone doesn't say
    // "array" for non-primitive types, so this can't be dropped as redundant.
    const flags = flagsFromField({
      isArray: watch(`properties.${index}.isArray`),
      isPIIData: watch(`properties.${index}.isPIIData`),
      isUniqueData: watch(`properties.${index}.isUniqueData`),
      defaultValue,
    });
    return (
      <div className="min-w-0 space-y-1">
        <span className="block text-xs text-muted-foreground">Flags</span>
        {flags.length > 0 ? (
          <FieldFlags flags={flags} titles={flagTitlesFromField({ defaultValue })} />
        ) : (
          <p className="text-sm text-muted-foreground/40">—</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-xs text-muted-foreground">Flags</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {FLAG_TOGGLES.map(({ flag, key, notForChildTypes }) => {
          const notApplicable = notForChildTypes && isChildType;
          const disabled = isReadOnly || notApplicable;
          const chip = (
            <FlagToggleChip
              flag={flag}
              active={watch(`properties.${index}.${key}`) === true}
              disabled={disabled}
              onToggle={() => setValue(`properties.${index}.${key}`, watch(`properties.${index}.${key}`) !== true, { shouldDirty: true })}
            />
          );
          if (!disabled) return <span key={key}>{chip}</span>;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>{chip}</TooltipTrigger>
              <TooltipContent>
                {notApplicable ? `${flag} is not applicable for child types` : `${flag} is read-only for default properties`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function RequiredField({ form, name }: Readonly<{ form: CardForm; name: string }>) {
  const { index, isEditMode, isReadOnly, watch, setValue } = form;
  return (
    <div className="min-w-0 space-y-1">
      <FieldHeading>Required</FieldHeading>
      {isEditMode ? (
        <Select
          value={watch(`properties.${index}.requiredOn`) ?? "None"}
          onValueChange={(value) => setValue(`properties.${index}.requiredOn`, value as IField["requiredOn"], { shouldDirty: true })}
          disabled={isReadOnly}
        >
          <SelectTrigger aria-label={`IsRequired for ${name || "property"}`} className={PROPERTY_FIELD_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["None", "Insert", "Update", "Both"] as const).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p>
          <RequiredBadge requiredOn={watch(`properties.${index}.requiredOn`)} />
        </p>
      )}
    </div>
  );
}

function DescriptionField({ form }: Readonly<{ form: CardForm }>) {
  const { index, isEditMode, isReadOnly, watch, setValue } = form;
  const description = watch(`properties.${index}.description`) ?? "";
  const inputId = useId();
  return (
    <div className="min-w-0 space-y-1">
      <FieldHeading htmlFor={isEditMode ? inputId : undefined}>Description</FieldHeading>
      {isEditMode ? (
        <Input
          id={inputId}
          value={description}
          onChange={(e) => setValue(`properties.${index}.description`, e.target.value, { shouldDirty: true })}
          placeholder={isReadOnly ? "—" : "Add description"}
          readOnly={isReadOnly}
          className={cn("w-full min-w-0", PROPERTY_FIELD_CLASS, isReadOnly && "cursor-not-allowed bg-muted opacity-50")}
        />
      ) : (
        <p className={cn("wrap-break-word text-sm", description ? "text-foreground" : "text-muted-foreground/40")}>{description || "—"}</p>
      )}
    </div>
  );
}

function AccessButton({
  reason,
  fieldSource,
  label,
  onOpen,
}: Readonly<{ reason: string | null; fieldSource?: IField; label: string; onOpen: () => void }>) {
  if (reason) return <DisabledWideButton reason={reason} icon={<Shield className="h-4 w-4 shrink-0" />} />;

  const levels = [
    { label: "View", level: fieldSource?.readAccessLevel },
    { label: "Create", level: fieldSource?.writeAccessLevel },
    { label: "Edit", level: fieldSource?.editAccessLevel },
  ] as const;
  const isCustom = levels.some(({ level }) => (ACCESS_LEVEL_TO_TYPE[level ?? 0] ?? ACCESS_TYPES.INHERITED) !== ACCESS_TYPES.INHERITED);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            WIDE_BUTTON,
            "transition-colors",
            isCustom ? "border-access-custom-border bg-access-custom-bg text-access-custom-fg" : "bg-background text-foreground hover:bg-accent",
          )}
          aria-label={label}
        >
          <Shield className="h-4 w-4 shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-1.5 text-xs">
          {levels.map(({ label: verb, level }, i) => (
            <span key={verb} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">|</span>}
              <span className="text-muted-foreground">{verb}:</span>
              <span>{accessLabel(level)}</span>
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ValidationButton({
  reason,
  fieldName,
  total,
  onOpen,
}: Readonly<{ reason: string | null; fieldName: string; total: number; onOpen: () => void }>) {
  if (reason) return <DisabledWideButton reason={reason} icon={<Check className="h-4 w-4 shrink-0" />} />;
  const label = total > 0 ? `Manage validations for ${fieldName} (${total})` : `Manage validations for ${fieldName}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(WIDE_BUTTON, "transition-colors", total > 0 ? "border-primary/30 bg-primary/10 text-primary" : "bg-background text-foreground hover:bg-accent")}
      aria-label={label}
    >
      <Check className="h-4 w-4 shrink-0" />
      {total > 0 && (
        <span aria-hidden className="text-xs font-semibold">
          {total}
        </span>
      )}
    </button>
  );
}

function CardActions({ index, name, onDuplicate, onDelete }: Readonly<{ index: number; name: string; onDuplicate: (index: number) => void; onDelete: (index: number) => void }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label={`More actions for ${name || "property"}`}>
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
  );
}

function SelectRowCheckbox({ checked, disabled, label, onChange }: Readonly<{ checked: boolean; disabled: boolean; label: string; onChange: (selected: boolean) => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="shrink-0">
          <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} aria-label={label} className="mt-1" />
        </div>
      </TooltipTrigger>
      {disabled && <TooltipContent>Save the field before selecting</TooltipContent>}
    </Tooltip>
  );
}

/** The field as the card shows it: the form row, or the loaded field; nested rules come from the schema response. */
function resolveField(field: SchemaMobileCardProps["field"], properties: PropertyRow[], index: number, original?: IField | null) {
  const source = (properties?.[index] as IField | undefined) ?? (field as unknown as IField);
  const forRules = source?.fields?.length ? source : (original ?? source);
  return { source, forRules };
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
  schemaName,
  openMobileTypePopoverIndex,
  setOpenMobileTypePopoverIndex,
  schemaItems,
  onTypeSearchChange,
  searchText,
  onOpenAccessDrawer,
  onOpenValidationDrawer,
  onOpenDefaultDrawer,
  showDefaultButton = false,
  isExpanded = false,
  onToggleExpand,
  childSchema,
  schemaType,
  showAccessColumn = true,
  showAccessValidationColumn = true,
  originalFieldFromSchema,
  isNestedAttributePanel = false,
}: Readonly<SchemaMobileCardProps>) {
  const [isReadonlyExpanded] = useReadonlyExpanded();
  const form: CardForm = { index, isEditMode, isReadOnly, watch, setValue };
  const name = watch(`properties.${index}.name`);
  const { source: fieldSource, forRules } = resolveField(field, properties, index, originalFieldFromSchema);
  const fieldName = (fieldSource?.name || name || "").trim();
  const defaultValue = forRules?.defaultValue ?? null;
  const currentType = watch(`properties.${index}.type`);
  const isPrimitiveType = typeOptions.includes(currentType);
  const resolvedChildSchema = childSchema ?? findChildSchemaByType(schemaItems, currentType);

  // For entity type schemas, show section headers and handle collapse
  const isEntityType = schemaType === 1;
  const isVisible = !isEntityType || !isReadOnly || isReadonlyExpanded;
  const typeReason = isPrimitiveType ? "" : "custom";
  const accessReason = unavailableReason(
    isEditMode,
    isNewField,
    typeReason && "Access is not available for custom property types",
    "Exit edit mode to manage access",
    "Save the field before setting access",
  );
  const validationReason = unavailableReason(
    isEditMode,
    isNewField,
    typeReason && "Validations are only available for primitive types",
    "Exit edit mode to manage validations",
    "Save the field before adding validations",
  );
  const fieldTarget: FieldAccessTarget | undefined = fieldName
    ? { name: fieldName, readAccess: fieldSource?.readAccess, writeAccess: fieldSource?.writeAccess, deleteAccess: fieldSource?.deleteAccess }
    : undefined;

  return (
    <>
      {/* Readonly Properties Section Header - Always show at index 0 for entity types */}
      {isEntityType && index === 0 && (
        <ReadonlySectionHeader count={properties.filter((p) => readonlyPropertyNames.includes(p.name)).length} />
      )}

      {/* Only render the card if not collapsed OR if not readonly */}
      {isVisible && (
        <div
          key={field.id}
          className={cn(
            "rounded-lg border p-4",
            isNestedAttributePanel ? "border-dashed border-border/80 bg-card shadow-xs dark:border-border" : "border-border bg-card shadow-xs",
            !isNestedAttributePanel && isReadOnly && isEntityType && "bg-primary/5",
            !isNestedAttributePanel && isExpanded && childSchema && "ring-2 ring-primary/20 dark:ring-primary/35",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            {isEditMode && (
              <SelectRowCheckbox
                checked={!!selectedRows[field.id]}
                disabled={isNewField}
                label={`Select ${name || "property"}`}
                onChange={(selected) => onRowSelect(field.id, selected)}
              />
            )}

            <div className="min-w-0 flex-1 space-y-4">
              {/* Two-column grid: Name | Type, then Flags | Required */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <NameField form={form} name={name} register={register} errors={errors} properties={properties} />
                <TypeField
                  form={form}
                  isChildType={Boolean(resolvedChildSchema)}
                  childName={resolvedChildSchema?.schemaName}
                  isExpanded={isExpanded}
                  onToggleExpand={onToggleExpand && (() => onToggleExpand(index))}
                  isPopoverOpen={openMobileTypePopoverIndex === index}
                  // A read-only (default) property's type can't be changed, so its picker never opens.
                  onPopoverChange={(open) => setOpenMobileTypePopoverIndex(open && !isReadOnly ? index : null)}
                  onClosePopover={() => setOpenMobileTypePopoverIndex(null)}
                  schemaItems={schemaItems}
                  onTypeSearchChange={onTypeSearchChange}
                  searchText={searchText}
                />
                <FlagsField form={form} isChildType={Boolean(resolvedChildSchema)} defaultValue={defaultValue} />
                {isPrimitiveType && <RequiredField form={form} name={name} />}
              </div>

              <DescriptionField form={form} />

              {/* Access | Validation | Default value buttons (hidden in Child tab) */}
              {showAccessValidationColumn && (
                <div className="min-w-0">
                  <div className="flex min-w-0 gap-2">
                    {showAccessColumn && (
                      <AccessButton
                        reason={accessReason}
                        fieldSource={fieldSource}
                        label={`View access for ${fieldTarget?.name || schemaName}`}
                        onOpen={() => onOpenAccessDrawer(fieldTarget, fieldName ? `Access for ${fieldName}` : `Access for ${schemaName}`)}
                      />
                    )}
                    <ValidationButton
                      reason={validationReason}
                      fieldName={fieldName}
                      total={getValidationDisplayInfo(forRules).total}
                      onOpen={() => onOpenValidationDrawer(fieldName, forRules?.validationRule)}
                    />
                    {showDefaultButton && onOpenDefaultDrawer && (
                      <DefaultValueButton
                        wide
                        fieldName={fieldName}
                        fieldType={currentType}
                        isNewField={isNewField}
                        isEditMode={isEditMode}
                        defaultValue={defaultValue}
                        onOpen={() => onOpenDefaultDrawer(fieldName, defaultValue)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {isEditMode && !isReadOnly && <CardActions index={index} name={name} onDuplicate={onDuplicate} onDelete={onDelete} />}
          </div>
        </div>
      )}
    </>
  );
}
