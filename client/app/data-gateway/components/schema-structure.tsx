import { Button } from "@/components/ui-kits/button/button";
import { Card } from "@/components/ui-kits/card/card";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { readonlyPropertyNames } from "../constants/input-restrictions";
import {
  IField,
  IFieldValidationRule,
  ISchemaDetails,
  IUpdateSchemaStructure,
} from "../models/data-service";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { FieldAccessTarget } from "../models/schema-access.types";
import { sanitizeRuleSet } from "../utils/schema-access.utils";
import SchemaAccessControlDrawer from "./schema-access-control-drawer";
import { SchemaPreviewDrawer } from "./schema-preview-drawer";
import { SchemaFieldValidationDrawer } from "./schema-fields-validation/schema-field-validation-drawer";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { InfoCard } from "./info-card";
import {
  defaultProperty,
  editSchemaConfirmationModalData,
  PropertyRow,
} from "../models/schema-structure.types";
import { useBulkOperations } from "../hooks/use-bulk-operations";
import { useSchemaPreview } from "../hooks/use-schema-preview";
import { useDtoPreviewMap } from "../hooks/use-dto-preview-map";
import {
  useRawIntrospectionQuery,
  useUpdateSchemaStructure,
} from "../hooks/use-configuration";
import { SchemaDesktopRow } from "./schema-structure/schema-desktop-row";
import { SchemaMobileCard } from "./schema-structure/schema-mobile-card";
import { SchemaStructureHeader } from "./schema-structure/schema-structure-header";
import { SchemaStructureTableSkeleton } from "./schema-structure-table-skeleton";
import { Plus } from "lucide-react";
import { useReadonlyExpanded } from "../hooks/use-readonly-expanded";
import { SchemaDataTab } from "./schema-data";
import { ChildSchemaExpandableContent } from "./child-schema-expandable-content";
import { buildValidationFieldName } from "../utils/schema-normalization";
import { findChildSchemaByType } from "@/data-gateway/utils/schema-structure.utils";

/**
 * Radix ScrollArea roots use overflow:hidden and only render a vertical thumb; wide nested
 * tables never get a horizontal scrollbar. Embedded (child) schema uses native overflow.
 */
function SchemaTableScrollRegion({
  embedded,
  heightClass,
  children,
}: {
  embedded: boolean;
  heightClass: string;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <div
        className={cn(
          heightClass,
          "flex min-h-0 w-full min-w-0 flex-col overflow-auto overscroll-x-contain [scrollbar-gutter:stable]",
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <ScrollArea className={cn(heightClass, "[scrollbar-gutter:stable]")}>
      {children}
    </ScrollArea>
  );
}

interface SchemaStructureTableProps extends ISchemaDetails {
  isLoading?: boolean;
  /** Use div instead of form when rendered inside Entity table expandable */
  disableFormElement?: boolean;
  /** Hide Attribute tab, Preview, Edit when inside Entity/All expandable (Child tab keeps full UI) */
  compactView?: boolean;
  /** Root schema ID for validation API (always the top-level schema being edited) */
  rootSchemaId?: string;
  /** Ancestor path for multi-level nesting (e.g. ["B", "C"] for A.B.C.password) */
  ancestorPath?: string[];
  /** @deprecated Use rootSchemaId + ancestorPath. Parent schema ID when nested. */
  parentSchemaId?: string;
  /** @deprecated Use ancestorPath. Parent property name when nested (e.g. "Assignee") */
  parentPropertyName?: string;
  /** When true, the Access | Validation column is hidden (propagated from parent Child tab) */
  hideAccessValidation?: boolean;
  /** Root entity schema name for policy GET/create (nested child tables use parent name) */
  policyEntitySchemaName?: string;
  /** Navigate to this schema in the main editor (sidebar). Used for embedded child empty state. */
  onOpenStandaloneSchemaEditor?: (schemaId: string) => void;
}

export default function SchemaStructureTable(props: SchemaStructureTableProps) {
  const {
    isLoading,
    disableFormElement,
    compactView,
    rootSchemaId,
    ancestorPath,
    parentSchemaId,
    parentPropertyName,
    hideAccessValidation,
    policyEntitySchemaName,
    onOpenStandaloneSchemaEditor,
    ...schemaDetails
  } = props;

  const effectivePolicySchemaName =
    policyEntitySchemaName ?? schemaDetails.schemaName;
  const resolvedRootSchemaId = rootSchemaId ?? schemaDetails.id;
  const resolvedAncestorPath =
    ancestorPath ?? (parentPropertyName ? [parentPropertyName] : []);
  const isEmbedded = compactView ?? false;
  const schemaType = schemaDetails.schemaType;
  const { mutateAsync } = useUpdateSchemaStructure();
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isValid, isDirty, errors },
  } = useForm({
    mode: "onChange",
    defaultValues: {
      properties: [] as IField[],
    },
  });

  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const { fields, append, remove, insert } = useFieldArray({
    control,
    name: "properties",
  });
  const [isReadonlyExpanded] = useReadonlyExpanded();

  const originalFieldNamesRef = useRef<string[]>([]);
  const previousFieldsHashRef = useRef<string>("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditConfirmationModalOpen, setIsEditConfirmationModalOpen] =
    useState(false);
  const [pendingPayload, setPendingPayload] = useState<IUpdateSchemaStructure>({
    fields: [],
    schemaDefinitionItemId: schemaDetails.id,
    deletableFieldNames: [],
    projectKey,
  });

  const [activeTab, setActiveTab] = useState<"attribute" | "data">("attribute");

  useEffect(() => {
    setActiveTab("attribute");
    setExpandedRowIndex(null);
  }, [schemaDetails.id]);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [isPropertyAccessDrawerOpen, setIsPropertyAccessDrawerOpen] =
    useState(false);
  const [isValidationDrawerOpen, setIsValidationDrawerOpen] = useState(false);
  const [currentValidationFieldName, setCurrentValidationFieldName] = useState<
    string | null
  >(null);
  const [currentValidationRule, setCurrentValidationRule] =
    useState<IFieldValidationRule | null>(null);
  const [currentAccessFieldTarget, setCurrentAccessFieldTarget] =
    useState<FieldAccessTarget | null>(null);
  const [currentAccessDrawerTitle, setCurrentAccessDrawerTitle] =
    useState("Manage access");
  const [openTypePopoverIndex, setOpenTypePopoverIndex] = useState<
    number | null
  >(null);
  const [openMobileTypePopoverIndex, setOpenMobileTypePopoverIndex] = useState<
    number | null
  >(null);
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const addPropertyScroll = useRef<HTMLTableSectionElement | null>(null);

  const handleToggleExpand = (index: number) => {
    setExpandedRowIndex((prev) => (prev === index ? null : index));
  };

  const { searchText, debouncedSetSearchText, schemaItems, dtoPreviewMap } =
    useDtoPreviewMap(projectKey);

  const {
    data: rawIntrospection,
    isPending: isGatewayIntrospectionPending,
    isFetching: isGatewayIntrospectionFetching,
  } = useRawIntrospectionQuery({
    projectKey,
    enabled: !!projectKey,
  });

  const bulkOperations = useBulkOperations({
    fields,
    properties: watch("properties"),
    insert,
    remove,
    readonlyPropertyNames,
    schemaType: schemaType,
  });
  const properties = watch("properties");
  const { previewData, templateFields } = useSchemaPreview(
    properties,
    dtoPreviewMap,
    {
      rawIntrospection,
      schemaName: schemaDetails?.schemaName,
    },
  );

  useEffect(() => {
    // Compute a hash of fields to avoid unnecessary form resets when only the
    // array reference changes (e.g. after validation API refetches schema details).
    const fieldsHash = JSON.stringify(
      (schemaDetails.fields ?? []).map((f) => ({
        name: f.name,
        type: f.type,
        isArray: f.isArray,
        totalValidationRules: f.totalValidationRules,
        readAccessLevel: f.readAccessLevel,
        writeAccessLevel: f.writeAccessLevel,
        editAccessLevel: f.editAccessLevel,
      })),
    );
    if (fieldsHash === previousFieldsHashRef.current) {
      return; // fields content unchanged — skip reset to preserve expanded state
    }
    previousFieldsHashRef.current = fieldsHash;

    if (schemaDetails.fields?.length) {
      const readonlyFields: IField[] = [];
      const editableFields: IField[] = [];

      schemaDetails.fields.forEach((field) => {
        if (
          schemaDetails?.schemaType === 1 &&
          readonlyPropertyNames.includes(field.name)
        ) {
          readonlyFields.push(field);
        } else {
          editableFields.push(field);
        }
      });

      readonlyFields.sort(
        (a, b) =>
          readonlyPropertyNames.indexOf(a.name) -
          readonlyPropertyNames.indexOf(b.name),
      );

      const sortedFields = [...readonlyFields, ...editableFields];

      reset({
        properties: sortedFields,
      });

      originalFieldNamesRef.current = sortedFields.map((f) => f.name);
    } else {
      reset({
        properties: isEmbedded ? [] : [defaultProperty],
      });
      originalFieldNamesRef.current = [];
    }

    setIsEditMode(false);
    bulkOperations.setSelectedRows({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaDetails.fields, schemaType, reset, isEmbedded]);

  // Rebuild bulk access targets when schema details change
  useEffect(() => {
    if (
      bulkOperations.selectedFieldNames.length > 0 &&
      schemaDetails.fields?.length
    ) {
      const updatedTargets = bulkOperations.selectedFieldNames
        .map((fieldName) => {
          const field = schemaDetails.fields.find((f) => f.name === fieldName);
          if (!field) return null;

          return {
            name: fieldName,
            readAccess: field.readAccess
              ? sanitizeRuleSet(field.readAccess)
              : undefined,
            writeAccess: field.writeAccess
              ? sanitizeRuleSet(field.writeAccess)
              : undefined,
            deleteAccess: field.deleteAccess
              ? sanitizeRuleSet(field.deleteAccess)
              : undefined,
          };
        })
        .filter(Boolean) as FieldAccessTarget[];

      if (updatedTargets.length > 0) {
        bulkOperations.setBulkAccessTargets((prev) => {
          if (!prev || prev.length !== updatedTargets.length) {
            return updatedTargets;
          }

          const hasChanged = prev.some((prevTarget, index) => {
            const newTarget = updatedTargets[index];
            if (!newTarget) return true;

            return (
              prevTarget.name !== newTarget.name ||
              JSON.stringify(prevTarget.readAccess) !==
                JSON.stringify(newTarget.readAccess) ||
              JSON.stringify(prevTarget.writeAccess) !==
                JSON.stringify(newTarget.writeAccess) ||
              JSON.stringify(prevTarget.deleteAccess) !==
                JSON.stringify(newTarget.deleteAccess)
            );
          });

          return hasChanged ? updatedTargets : prev;
        });
      }
    }
  }, [schemaDetails.fields, bulkOperations.selectedFieldNames, bulkOperations]);

  const onSubmit = (data: { properties: PropertyRow[] }) => {
    const currentNames = data.properties.map((p) => p.name);
    const deletedNames = originalFieldNamesRef.current.filter(
      (name) => !currentNames.includes(name),
    );

    const payload: IUpdateSchemaStructure = {
      fields: data.properties,
      schemaDefinitionItemId: schemaDetails.id,
      deletableFieldNames: deletedNames,
      projectKey,
    };

    setPendingPayload(payload);
    setIsEditConfirmationModalOpen(true);
  };

  const handleSchemaSave = () => {
    setIsEditConfirmationModalOpen(false);
    saveSchemaStructure(pendingPayload);
  };

  const saveSchemaStructure = async (payload: IUpdateSchemaStructure) => {
    const res = await mutateAsync(payload);

    if (res.isSuccess) {
      showSuccessToast({ description: "Schema updated successfully" });
      setIsEditMode(false);
      bulkOperations.setSelectedRows({});
      setPendingPayload({
        fields: [],
        schemaDefinitionItemId: schemaDetails.id,
        deletableFieldNames: [],
        projectKey: projectKey,
      });
      addPropertyScroll.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      showErrorToast({ errors: res.errors });
    }
  };

  const handleOpenValidationDrawer = (
    fieldName: string,
    validationRule?: IFieldValidationRule | null,
  ) => {
    const effectiveFieldName = buildValidationFieldName(
      resolvedAncestorPath,
      fieldName,
    );
    setCurrentValidationFieldName(effectiveFieldName);
    setCurrentValidationRule(validationRule ?? null);
    setIsValidationDrawerOpen(true);
  };

  const handleEditToggle = () => {
    reset({
      properties: originalFieldNamesRef.current.map((name, idx) => ({
        ...fields[idx],
        name,
      })),
    });

    if (isEditMode) {
      bulkOperations.setSelectedRows({});
    } else {
      setExpandedRowIndex(null);
    }

    setIsEditMode((prev) => !prev);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelectedRows: Record<string, boolean> = {};
      fields.forEach((field) => {
        newSelectedRows[field.id] = true;
      });
      bulkOperations.setSelectedRows(newSelectedRows);
    } else {
      bulkOperations.setSelectedRows({});
    }
  };

  // Loading State
  if (isLoading) {
    return <SchemaStructureTableSkeleton />;
  }

  const totalFieldLength = Object.keys(previewData).length;
  const readonlyFieldsCount =
    schemaType === 1
      ? properties.filter((p) => readonlyPropertyNames.includes(p.name)).length
      : 0;
  const customFieldsCount =
    schemaType === 1 ? fields.length - readonlyFieldsCount : 0;
  const showEmptyState =
    (totalFieldLength === 0 || totalFieldLength === readonlyFieldsCount) &&
    !isEditMode;
  const showEmptyCustomPropertiesHeader =
    schemaType === 1 && customFieldsCount === 0;
  const isChildTabOnly = (schemaType as number) === 2 && !isEmbedded;
  const shouldHideAccessValidation = hideAccessValidation || isChildTabOnly;
  const hasDesktopColumns = totalFieldLength > 0 || isEditMode;
  const visibleColumnCount =
    7 + (isEditMode ? 1 : 0) + (shouldHideAccessValidation ? 0 : 1);
  // Wider IsArray / IsPII / IsUnique columns so labels and toggles do not crowd (main + nested).
  const desktopColumnWidths = isEditMode
    ? shouldHideAccessValidation
      ? ["5%", "19%", "16%", "10%", "10%", "10%", "25%", "5%"]
      : ["5%", "17%", "14%", "10%", "10%", "10%", "18%", "10%", "6%"]
    : shouldHideAccessValidation
      ? ["20%", "17%", "10%", "10%", "10%", "28%", "5%"]
      : ["18%", "16%", "10%", "10%", "10%", "20%", "11%", "5%"];
  const emptyStateMobile =
    (totalFieldLength === readonlyFieldsCount || totalFieldLength === 0) &&
    !isEditMode;

  const EmptySchemaPropertyState = () => {
    if (isEmbedded) {
      return (
        <div
          className={cn(
            "flex w-full flex-1 flex-col items-center justify-center px-4 py-10",
            isReadonlyExpanded && "py-8",
          )}
        >
          <div className="flex max-w-md flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h3 className="break-words text-base font-semibold leading-snug text-foreground sm:text-lg">
                <span className="font-medium">{schemaDetails.schemaName}</span>{" "}
                doesn’t have any{" "}
                {schemaType === 1 ? "custom property" : "property"} yet.
              </h3>
              <p className="text-sm text-muted-foreground">
                Nested child schemas cannot be edited here. Open this schema
                from the Schemas list (Child) to add or change properties.
              </p>
            </div>
            {onOpenStandaloneSchemaEditor && schemaDetails.id ? (
              <Button
                type="button"
                className="gap-2"
                onClick={() => onOpenStandaloneSchemaEditor(schemaDetails.id)}
              >
                Open child schema
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center py-12",
          schemaType === 1 ? "h-[calc(100vh-542px)]" : "h-[calc(100vh-450px)]",
          isReadonlyExpanded && "h-[calc(100vh-495px)]",
        )}
      >
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <h3 className="break-words px-2 text-center text-base font-semibold leading-snug text-foreground sm:text-lg">
              This schema doesn’t have any{" "}
              {schemaType === 1 ? "custom property" : "property"} yet. Click Add
              Property to set one up.
            </h3>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              handleEditToggle();
              append({ ...defaultProperty });
              setTimeout(() => {
                addPropertyScroll.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "end",
                  inline: "nearest",
                });
              }, 100);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Property
          </Button>
        </div>
      </div>
    );
  };

  const scrollAreaHeightClass = isDirty
    ? "h-[calc(100vh-576px)]"
    : isEditMode
      ? "h-[calc(100vh-507px)]"
      : "h-[calc(100vh-450px)]";
  const cardHeightClass = "xl:h-[calc(100vh-334px)]";
  const useDivWrapper = disableFormElement || isEmbedded;
  const FormWrapper = useDivWrapper ? "div" : "form";
  const formProps = useDivWrapper
    ? { className: "space-y-3" }
    : { onSubmit: handleSubmit(onSubmit), className: "space-y-3" };

  return schemaDetails?.id ? (
    <>
      <FormWrapper {...formProps}>
        <Card
          className={cn(
            cardHeightClass,
            "flex flex-col overflow-hidden shadow-none",
            isEmbedded && "min-w-0",
          )}
        >
          {!isEmbedded && (
            <SchemaStructureHeader
              isEditMode={isEditMode}
              isDirty={isDirty}
              isValid={isValid}
              hasSelectedRows={bulkOperations.hasSelectedRows}
              selectedFieldEntriesLength={
                bulkOperations.selectedFieldEntries.length
              }
              fieldsLength={fields.length}
              schemaId={schemaDetails.id}
              projectKey={projectKey}
              isClsEnabled={schemaDetails.isClsEnabled}
              isRlsEnabled={schemaDetails.isRlsEnabled}
              schemaName={schemaDetails.schemaName}
              schemaType={schemaType}
              templateFields={templateFields}
              previewData={previewData}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onEditToggle={handleEditToggle}
              onBulkDuplicate={bulkOperations.handleBulkDuplicate}
              onBulkDelete={bulkOperations.handleBulkDelete}
              onSelectAll={handleSelectAll}
              isPreviewDrawerOpen={isPreviewDrawerOpen}
              setIsPreviewDrawerOpen={setIsPreviewDrawerOpen}
              onSaveClick={
                useDivWrapper ? () => handleSubmit(onSubmit)() : undefined
              }
            />
          )}

          {activeTab === "attribute" &&
            isEditMode &&
            isDirty &&
            !isEmbedded && (
              <div className="mt-4 rounded-md border border-base-warning bg-warning-100 p-4 dark:border-icon-warning dark:bg-warning-800/20">
                <div className="flex items-start gap-2 text-warning-700 dark:text-icon-warning">
                  <p className="text-sm">
                    Editing the schema structure properties will impact all
                    areas of the application where they are used.
                  </p>
                </div>
              </div>
            )}

          {/* Data Tab */}
          {activeTab === "data" && (
            <div className="mt-4 min-h-0 flex-1 overflow-hidden px-0">
              <SchemaDataTab
                schemaName={schemaDetails.schemaName}
                fields={templateFields}
                previewData={previewData}
              />
            </div>
          )}

          {/* Desktop Table View */}
          <div
            className={cn(
              activeTab === "attribute" ? "hidden xl:block" : "hidden",
              isEmbedded && "min-h-0 flex-1",
            )}
          >
            <SchemaTableScrollRegion
              embedded={isEmbedded}
              heightClass={scrollAreaHeightClass}
            >
              {!(showEmptyState && isEmbedded) && (
                <Table className={cn("w-full table-fixed")}>
                  {hasDesktopColumns && (
                    <colgroup>
                      {desktopColumnWidths.map((width, index) => (
                        <col key={`desktop-col-${index}`} style={{ width }} />
                      ))}
                    </colgroup>
                  )}
                  {hasDesktopColumns && (
                    <TableHeader>
                      <TableRow>
                        {isEditMode && (
                          <TableHead>
                            {totalFieldLength > 0 && (
                              <Checkbox
                                checked={
                                  bulkOperations.hasSelectedRows &&
                                  bulkOperations.selectedFieldEntries.length ===
                                    fields.length
                                }
                                onCheckedChange={handleSelectAll}
                                aria-label="Select all properties"
                              />
                            )}
                          </TableHead>
                        )}
                        <TableHead>Property name</TableHead>
                        <TableHead>Property type</TableHead>
                        <TableHead className="whitespace-nowrap px-3 text-center md:px-3">
                          IsArray
                        </TableHead>
                        <TableHead className="whitespace-nowrap px-3 text-center md:px-3">
                          IsPII
                        </TableHead>
                        <TableHead className="whitespace-nowrap px-3 pr-5 text-center md:px-3 md:pr-5">
                          IsUnique
                        </TableHead>
                        <TableHead className="px-3 text-left md:px-3">
                          Description
                        </TableHead>
                        {!shouldHideAccessValidation && (
                          <TableHead>
                            <span className="flex items-center gap-1 whitespace-normal">
                              Access{" "}
                              <span className="text-muted-foreground">|</span>{" "}
                              Validation
                            </span>
                          </TableHead>
                        )}
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                  )}
                  <TableBody ref={addPropertyScroll}>
                    {fields.map((field, index) => {
                      const name = watch(`properties.${index}.name`);
                      const currentType = watch(`properties.${index}.type`);
                      const childSchema = findChildSchemaByType(
                        schemaItems,
                        currentType,
                      );
                      const originalField = schemaDetails.fields?.find(
                        (f) => f.name === name,
                      );
                      const isReadOnly =
                        schemaDetails?.schemaType === 1 &&
                        readonlyPropertyNames.includes(name);
                      const isNewField = index >= schemaDetails.fields.length;
                      const isExpanded = expandedRowIndex === index;
                      return (
                        <Fragment key={field.id}>
                          <SchemaDesktopRow
                            key={field.id}
                            field={field}
                            index={index}
                            isEditMode={isEditMode}
                            isReadOnly={isReadOnly}
                            isNewField={isNewField}
                            selectedRows={bulkOperations.selectedRows}
                            onRowSelect={(fieldId, selected) =>
                              bulkOperations.setSelectedRows((prev) => ({
                                ...prev,
                                [fieldId]: selected,
                              }))
                            }
                            register={register}
                            watch={watch}
                            setValue={setValue}
                            errors={errors}
                            properties={properties}
                            onDuplicate={(idx) =>
                              insert(idx + 1, { ...fields[idx] })
                            }
                            onDelete={remove}
                            schemaId={schemaDetails.id}
                            schemaName={schemaDetails.schemaName}
                            schemaType={schemaType}
                            schemaReadAccess={schemaDetails.readAccess}
                            schemaWriteAccess={schemaDetails.writeAccess}
                            schemaDeleteAccess={schemaDetails.deleteAccess}
                            openTypePopoverIndex={openTypePopoverIndex}
                            setOpenTypePopoverIndex={setOpenTypePopoverIndex}
                            schemaItems={schemaItems}
                            onTypeSearchChange={debouncedSetSearchText}
                            searchText={searchText}
                            onOpenAccessDrawer={(fieldTarget, title) => {
                              setCurrentAccessFieldTarget(fieldTarget ?? null);
                              const nestedTitle =
                                fieldTarget?.name &&
                                resolvedAncestorPath.length > 0
                                  ? `Access for ${buildValidationFieldName(resolvedAncestorPath, fieldTarget.name)}`
                                  : title;
                              setCurrentAccessDrawerTitle(nestedTitle);
                              setIsPropertyAccessDrawerOpen(true);
                            }}
                            onOpenValidationDrawer={handleOpenValidationDrawer}
                            isExpanded={isExpanded}
                            onToggleExpand={handleToggleExpand}
                            childSchema={childSchema}
                            totalFields={fields.length}
                            totalFieldsLength={totalFieldLength}
                            showAccessColumn={schemaType === 1 || isEmbedded}
                            showAccessValidationColumn={
                              !shouldHideAccessValidation
                            }
                            visibleColumnCount={visibleColumnCount}
                            originalFieldFromSchema={originalField}
                          />
                          {isExpanded && childSchema && (
                            <TableRow key={`${field.id}-expanded`}>
                              <TableCell
                                colSpan={visibleColumnCount}
                                className="bg-muted/30 p-4 align-top dark:bg-muted/25"
                              >
                                <ChildSchemaExpandableContent
                                  schemaId={childSchema.id}
                                  projectKey={projectKey}
                                  rootSchemaId={resolvedRootSchemaId}
                                  ancestorPath={[...resolvedAncestorPath, name]}
                                  parentSchemaId={schemaDetails.id}
                                  parentPropertyName={name}
                                  parentFieldWithNested={originalField}
                                  hideAccessValidation={
                                    shouldHideAccessValidation
                                  }
                                  policyEntitySchemaName={
                                    policyEntitySchemaName ??
                                    schemaDetails.schemaName
                                  }
                                  onOpenStandaloneSchemaEditor={
                                    onOpenStandaloneSchemaEditor
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                    {showEmptyCustomPropertiesHeader && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={visibleColumnCount}
                          className="bg-muted/30 px-4 py-2"
                        >
                          <div className="text-sm font-medium text-foreground">
                            {schemaDetails.schemaName} Properties (
                            {customFieldsCount})
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
              {showEmptyState && <EmptySchemaPropertyState />}
            </SchemaTableScrollRegion>
          </div>

          {/* Mobile Card View */}
          <div
            className={activeTab === "attribute" ? "block xl:hidden" : "hidden"}
          >
            <div
              className={cn(
                "overflow-auto",
                !isEditMode && "max-h-[calc(100vh-230px)]",
                isEditMode && !isDirty && "max-h-[calc(100vh-310px)]",
                isEditMode && isDirty && "max-h-[calc(100vh-400px)]",
              )}
            >
              <div className="min-w-0 space-y-3 pb-4">
                {fields.map((field, index) => {
                  const name = watch(`properties.${index}.name`);
                  const currentType = watch(`properties.${index}.type`);
                  const childSchema = findChildSchemaByType(
                    schemaItems,
                    currentType,
                  );
                  const originalField = schemaDetails.fields?.find(
                    (f) => f.name === name,
                  );
                  const isReadOnly =
                    schemaDetails?.schemaType === 1 &&
                    readonlyPropertyNames.includes(name);
                  const isNewField = index >= schemaDetails.fields.length;
                  const isExpanded = expandedRowIndex === index;
                  return (
                    <Fragment key={field.id}>
                      <SchemaMobileCard
                        field={field}
                        index={index}
                        isEditMode={isEditMode}
                        isReadOnly={isReadOnly}
                        isNewField={isNewField}
                        selectedRows={bulkOperations.selectedRows}
                        onRowSelect={(fieldId, selected) =>
                          bulkOperations.setSelectedRows((prev) => ({
                            ...prev,
                            [fieldId]: selected,
                          }))
                        }
                        register={register}
                        watch={watch}
                        setValue={setValue}
                        errors={errors}
                        properties={properties}
                        onDuplicate={(idx) =>
                          insert(idx + 1, { ...fields[idx] })
                        }
                        onDelete={remove}
                        schemaId={schemaDetails.id}
                        schemaName={schemaDetails.schemaName}
                        schemaType={schemaType}
                        schemaReadAccess={schemaDetails.readAccess}
                        schemaWriteAccess={schemaDetails.writeAccess}
                        schemaDeleteAccess={schemaDetails.deleteAccess}
                        openMobileTypePopoverIndex={openMobileTypePopoverIndex}
                        setOpenMobileTypePopoverIndex={
                          setOpenMobileTypePopoverIndex
                        }
                        schemaItems={schemaItems}
                        onTypeSearchChange={debouncedSetSearchText}
                        searchText={searchText}
                        onOpenAccessDrawer={(fieldTarget, title) => {
                          setCurrentAccessFieldTarget(fieldTarget ?? null);
                          const nestedTitle =
                            fieldTarget?.name && resolvedAncestorPath.length > 0
                              ? `Access for ${buildValidationFieldName(resolvedAncestorPath, fieldTarget.name)}`
                              : title;
                          setCurrentAccessDrawerTitle(nestedTitle);
                          setIsPropertyAccessDrawerOpen(true);
                        }}
                        onOpenValidationDrawer={handleOpenValidationDrawer}
                        isExpanded={isExpanded}
                        onToggleExpand={handleToggleExpand}
                        childSchema={childSchema}
                        totalFields={fields.length}
                        showAccessColumn={schemaType === 1 || isEmbedded}
                        showAccessValidationColumn={!shouldHideAccessValidation}
                        originalFieldFromSchema={originalField}
                        isNestedAttributePanel={isEmbedded}
                      />
                      {isExpanded && childSchema && (
                        <div className="mt-3">
                          <ChildSchemaExpandableContent
                            schemaId={childSchema.id}
                            projectKey={projectKey}
                            rootSchemaId={resolvedRootSchemaId}
                            ancestorPath={[...resolvedAncestorPath, name]}
                            parentSchemaId={schemaDetails.id}
                            parentPropertyName={name}
                            parentFieldWithNested={originalField}
                            hideAccessValidation={shouldHideAccessValidation}
                            policyEntitySchemaName={
                              policyEntitySchemaName ?? schemaDetails.schemaName
                            }
                            onOpenStandaloneSchemaEditor={
                              onOpenStandaloneSchemaEditor
                            }
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                {emptyStateMobile && (
                  <>
                    <div className="rounded-lg bg-muted/30 px-4 py-3">
                      <div className="text-sm font-medium text-foreground">
                        {schemaDetails.schemaName} Properties (
                        {customFieldsCount})
                      </div>
                    </div>
                    <EmptySchemaPropertyState />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Add Property */}
          {isEditMode && activeTab === "attribute" && !isEmbedded && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  append({ ...defaultProperty });
                  setTimeout(() => {
                    addPropertyScroll.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "end",
                      inline: "nearest",
                    });
                  }, 100);
                }}
              >
                + Add property
              </Button>
            </div>
          )}
        </Card>
      </FormWrapper>

      <Dialog
        open={isEditConfirmationModalOpen}
        onOpenChange={setIsEditConfirmationModalOpen}
      >
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={handleSchemaSave}
          data={editSchemaConfirmationModalData}
        />
      </Dialog>

      {bulkOperations.bulkAccessTargets && (
        <SchemaAccessControlDrawer
          schemaId={resolvedRootSchemaId}
          schemaName={effectivePolicySchemaName}
          fields={schemaDetails.fields}
          level="column"
          readAccessLevel={schemaDetails.readAccessLevel}
          writeAccessLevel={schemaDetails.writeAccessLevel}
          editAccessLevel={schemaDetails.editAccessLevel}
          deleteAccessLevel={schemaDetails.deleteAccessLevel}
          fieldNames={bulkOperations.selectedFieldNames.map((fn) =>
            buildValidationFieldName(resolvedAncestorPath, fn),
          )}
          title={bulkOperations.bulkAccessTitle}
          open={bulkOperations.isBulkAccessDrawerOpen}
          onOpenChange={(open) => {
            bulkOperations.setIsBulkAccessDrawerOpen(open);
            if (!open) {
              bulkOperations.setBulkAccessTargets(null);
              bulkOperations.setBulkAccessTitle("Manage access");
              bulkOperations.setSelectedFieldNames([]);
            }
          }}
        />
      )}

      <SchemaAccessControlDrawer
        schemaId={resolvedRootSchemaId}
        schemaName={effectivePolicySchemaName}
        fields={schemaDetails.fields}
        level="column"
        readAccessLevel={schemaDetails.readAccessLevel}
        writeAccessLevel={schemaDetails.writeAccessLevel}
        editAccessLevel={schemaDetails.editAccessLevel}
        deleteAccessLevel={schemaDetails.deleteAccessLevel}
        fieldNames={
          currentAccessFieldTarget
            ? [
                buildValidationFieldName(
                  resolvedAncestorPath,
                  currentAccessFieldTarget.name,
                ),
              ]
            : []
        }
        title={currentAccessDrawerTitle}
        open={isPropertyAccessDrawerOpen}
        onOpenChange={(open) => {
          setIsPropertyAccessDrawerOpen(open);
          if (!open) {
            setCurrentAccessFieldTarget(null);
            setCurrentAccessDrawerTitle("Manage access");
          }
        }}
      />

      {currentValidationFieldName && (
        <SchemaFieldValidationDrawer
          fieldName={currentValidationFieldName}
          schemaId={resolvedRootSchemaId}
          projectKey={projectKey}
          initialValidationData={currentValidationRule}
          open={isValidationDrawerOpen}
          onOpenChange={(open) => {
            setIsValidationDrawerOpen(open);
            if (!open) {
              setCurrentValidationFieldName(null);
              setCurrentValidationRule(null);
            }
          }}
        />
      )}

      {/* Mobile Preview Drawer - Controlled */}
      <SchemaPreviewDrawer
        schemaName={schemaDetails.schemaName}
        schemaType={schemaType}
        fields={templateFields}
        previewData={previewData}
        title={`${schemaDetails.schemaName} preview`}
        open={isPreviewDrawerOpen}
        onOpenChange={setIsPreviewDrawerOpen}
        rawIntrospection={rawIntrospection}
        isGatewayIntrospectionPending={isGatewayIntrospectionPending}
        isGatewayIntrospectionFetching={isGatewayIntrospectionFetching}
      />
    </>
  ) : (
    <InfoCard
      title="Schema Structure"
      message="Select a schema from the sidebar to view its structure."
    />
  );
}
