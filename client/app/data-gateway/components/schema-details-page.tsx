"use client";

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DataGatewayPageBar } from "./page-bar";
import { AccessInspector, type AccessInspectorTarget } from "./access-inspector";
import { ValidationInspector, type ValidationInspectorTarget } from "./validation-inspector";

import {
  getPolicyDataQueryOptions,
  useCreateSchema,
  useSchemaDetails,
} from "../hooks/use-configuration";
import { useDataGatewaySearchParams } from "../hooks/use-data-gateway-search-params";
import {
  ICreateSchemaDefaultValues,
  ICreateSchemaPayload,
  ISchemaDetails,
} from "../models/data-service";
import {
  createEmptyAccessRuleSet,
  normalizeAccessRuleSet,
} from "../utils/schema-access.utils";
import { normalizeSchemaFields } from "../utils/schema-normalization";
import { AddEditSchemaModal } from "./add-edit-schema";
import { SchemaBasicInfo } from "./schema-basic-info";
import SchemasSidebar, {
  type DataGatewayListQueryUpdate,
} from "./schema-side-bar";
import SchemaStructureTable from "./schema-structure";

const EMPTY_SCHEMA: ISchemaDetails = {
  id: "",
  schemaName: "",
  schemaType: 0,
  collectionName: "",
  fields: [],
  totalPermissions: 0,
  totalRoles: 0,
  totalUsers: 0,
  readAccess: createEmptyAccessRuleSet(),
  writeAccess: createEmptyAccessRuleSet(),
  deleteAccess: createEmptyAccessRuleSet(),
  projectKey: "",
  isRlsEnabled: false,
  isClsEnabled: false,
  projectShortKey: "",
  totalSchemaReferences: 0,
  schemaReferences: [],
  readAccessLevel: 1,
  writeAccessLevel: 1,
  editAccessLevel: 1,
  deleteAccessLevel: 1,
};

export const SchemaDetailsPage = () => {
  const queryClient = useQueryClient();
  const [isAddEditSchemaModalOpen, setIsAddEditSchemaModalOpen] =
    useState(false);
  const [addEditSchemaInstance, setAddEditSchemaInstance] = useState(0);

  /**
   * Access, docked beside the table. It widens for the rule editor, and the
   * explorer folds to a rail at that point so the table keeps its width
   * instead of paying for the inspector twice.
   */
  const [inspector, setInspector] = useState<AccessInspectorTarget | null>(null);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);

  // Validations, docked the same way — the two share one column, so opening
  // either one closes the other rather than trying to fit both side by side.
  const [validationInspector, setValidationInspector] =
    useState<ValidationInspectorTarget | null>(null);

  const closeInspector = useCallback(() => {
    setInspector(null);
    setIsInspectorExpanded(false);
  }, []);

  const openAccessInspector = useCallback((target: AccessInspectorTarget) => {
    setValidationInspector(null);
    setInspector(target);
  }, []);

  const openValidationInspector = useCallback(
    (target: ValidationInspectorTarget) => {
      setInspector(null);
      setIsInspectorExpanded(false);
      setValidationInspector(target);
    },
    [],
  );

  // `type` is purely the Entity/Child list filter now. It used to double as the
  // view switch — absent meant the security landing — which is why a bare
  // /data-gateway bookmark opened the security table instead of the schemas.
  const [queryParams, setQueryParams] = useDataGatewaySearchParams();

  const handleListQueryChange = useCallback(
    (update: DataGatewayListQueryUpdate) => {
      setQueryParams(update, { history: "push" });
    },
    [setQueryParams],
  );

  const selectedSchemaId = queryParams.schemaId;

  // Access shown for the previous schema would be wrong, not just stale, so the
  // inspector closes as the focus moves — during render, before it can paint
  // the wrong subject.
  const [inspectedSchemaId, setInspectedSchemaId] = useState(selectedSchemaId);
  if (inspectedSchemaId !== selectedSchemaId) {
    setInspectedSchemaId(selectedSchemaId);
    if (inspector) closeInspector();
    if (validationInspector) setValidationInspector(null);
  }

  const selectedProject = useProjectStore().selectedProject;
  const projectKey = selectedProject?.tenantId ?? "";
  const [schemaDetails, setSchemaDetails] = useState<ISchemaDetails>({
    ...EMPTY_SCHEMA,
    projectKey,
  });

  const { data: schemaDetailsQuery, isLoading: isSchemaDetailsLoading } =
    useSchemaDetails(selectedSchemaId ?? "", projectKey, {
      enabled: Boolean(selectedSchemaId),
    });
  const { mutateAsync: createSchema } = useCreateSchema();

  const onSchemaCreate = async (
    values: ICreateSchemaDefaultValues,
  ): Promise<boolean> => {
    try {
      const payload: ICreateSchemaPayload = {
        schemaName: values.schemaName,
        collectionName: values.schemaType == "Entity" ? values.entityName : "",
        schemaType: values.schemaType == "Entity" ? 1 : 2,
        projectKey,
      };

      const res = await createSchema(payload);

      if (res.isSuccess) {
        setQueryParams(
          {
            type: "all",
            schemaId: res.data.itemId,
            page: queryParams.page,
            pageSize: queryParams.pageSize,
          },
          { history: "push" },
        );
        showSuccessToast({ description: "Schema added successfully" });
        setIsAddEditSchemaModalOpen(false);
        return true;
      } else {
        showErrorToast({ errors: res.errors });
        return false;
      }
    } catch (error) {
      console.error("Error in onSchemaCreate:", error);
      showErrorToast({ errors: ["An unexpected error occurred"] });
      return false;
    }
  };

  const onDeleteSchema = () => {
    setSchemaDetails({ ...EMPTY_SCHEMA, projectKey });
    handleListQueryChange({ schemaId: null });
  };

  /** Schema two-panel view: set list filter context and focused schema (URL stays in sync with sidebar). */
  const openSchemaInEditor = (schemaId: string | null) => {
    setQueryParams(
      {
        type: "all",
        schemaId,
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      },
      { history: "push" },
    );
  };

  // Warm policy cache for access drawers (query key is parent schemaName for all column rules).
  useEffect(() => {
    if (!selectedSchemaId || !projectKey) return;
    const schemaName = schemaDetailsQuery?.data?.schemaName;
    if (!schemaName) return;
    void queryClient.prefetchQuery(
      getPolicyDataQueryOptions(schemaName, projectKey),
    );
  }, [
    selectedSchemaId,
    projectKey,
    schemaDetailsQuery?.data?.schemaName,
    queryClient,
  ]);

  useEffect(() => {
    if (schemaDetailsQuery?.data) {
      const res = schemaDetailsQuery.data;
      setSchemaDetails({
        id: res.id,
        schemaName: res.schemaName,
        schemaType: res.schemaType,
        collectionName: res.collectionName,
        fields: normalizeSchemaFields(res.fields),
        totalPermissions: res.totalPermissions,
        totalUsers: res.totalUsers,
        totalRoles: res.totalRoles,
        readAccess: normalizeAccessRuleSet(res.readAccess),
        writeAccess: normalizeAccessRuleSet(res.writeAccess),
        deleteAccess: normalizeAccessRuleSet(res.deleteAccess),
        projectKey: res.projectKey ?? projectKey,
        isRlsEnabled: res.isRlsEnabled ?? false,
        isClsEnabled: res.isClsEnabled ?? false,
        projectShortKey: res.projectShortKey,
        totalSchemaReferences: res.totalSchemaReferences,
        schemaReferences: res.schemaReferences,
        readAccessLevel: res.readAccessLevel,
        writeAccessLevel: res.writeAccessLevel,
        editAccessLevel: res.editAccessLevel,
        deleteAccessLevel: res.deleteAccessLevel,
      });
    }
  }, [schemaDetailsQuery, projectKey]);

  return (
    <>
      <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
        <DataGatewayPageBar />

        {/* ── Schema two-panel view ── */}
        <div className="flex flex-col gap-4 pt-0 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
          {/* Explorer */}
          {isInspectorExpanded ? (
            <button
              type="button"
              onClick={() => setIsInspectorExpanded(false)}
              aria-label="Show the schema list"
              className="hidden w-[52px] shrink-0 flex-col items-center gap-2 rounded-sm border border-border/40 bg-card py-3 text-muted-foreground transition-colors hover:text-foreground lg:flex"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
              <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">
                Schemas
              </span>
            </button>
          ) : (
          <div
            className={`shrink-0 ${selectedSchemaId ? "hidden lg:block" : "block"}`}
          >
            <SchemasSidebar
              onAddSchema={() => {
                setAddEditSchemaInstance((n) => n + 1);
                setIsAddEditSchemaModalOpen(true);
              }}
              selectedSchemaId={selectedSchemaId}
              filterType={queryParams.type ?? "all"}
              page={queryParams.page}
              pageSize={queryParams.pageSize}
              onListQueryChange={handleListQueryChange}
            />
          </div>
          )}

          {/* Main content */}
          <div
            className={`flex w-full min-w-0 flex-col gap-4 lg:h-full lg:flex-1 lg:overflow-hidden ${
              !selectedSchemaId ? "hidden lg:flex" : "block lg:flex"
            }`}
          >
            {/* Mobile / tablet header (narrow shell) */}
            <div className="flex items-center gap-2 pb-2 lg:hidden">
              <button
                type="button"
                aria-label="Back to schema list"
                onClick={() => handleListQueryChange({ schemaId: null })}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold">
                {schemaDetails.schemaName}
              </h2>
            </div>

            {/* Mobile: show only when schema selected */}
            <div
              className={`${selectedSchemaId ? "flex" : "hidden"} flex-col gap-4 lg:hidden`}
            >
              <SchemaBasicInfo
                {...schemaDetails}
                onDeleteSuccess={onDeleteSchema}
                isLoading={isSchemaDetailsLoading}
              />
              <SchemaStructureTable
                {...schemaDetails}
                isLoading={isSchemaDetailsLoading}
                onOpenStandaloneSchemaEditor={openSchemaInEditor}
              />
            </div>

            {/* Desktop */}
            <div className="hidden min-h-0 flex-1 flex-col gap-4 lg:flex">
              <SchemaBasicInfo
                {...schemaDetails}
                onDeleteSuccess={onDeleteSchema}
                isLoading={isSchemaDetailsLoading}
                onOpenSchemaAccess={(tab) =>
                  openAccessInspector({
                    subject: schemaDetails.schemaName,
                    context: "Schema access",
                    schemaName: schemaDetails.schemaName,
                    schemaId: schemaDetails.id,
                    fields: schemaDetails.fields,
                    level: "row",
                    readAccessLevel: schemaDetails.readAccessLevel,
                    writeAccessLevel: schemaDetails.writeAccessLevel,
                    editAccessLevel: schemaDetails.editAccessLevel,
                    deleteAccessLevel: schemaDetails.deleteAccessLevel,
                    selectedTab: tab,
                  })
                }
              />
              <SchemaStructureTable
                {...schemaDetails}
                isLoading={isSchemaDetailsLoading}
                onOpenStandaloneSchemaEditor={openSchemaInEditor}
                onOpenFieldAccess={({ fieldNames, subject, context }) =>
                  openAccessInspector({
                    subject,
                    context,
                    schemaName: schemaDetails.schemaName,
                    schemaId: schemaDetails.id,
                    fields: schemaDetails.fields,
                    level: "column",
                    fieldNames,
                  })
                }
                onOpenFieldValidation={({ fieldName, subject, context, validationRule }) =>
                  openValidationInspector({
                    subject,
                    context,
                    fieldName,
                    schemaId: schemaDetails.id,
                    projectKey,
                    initialValidationData: validationRule,
                  })
                }
              />
            </div>
          </div>

          {inspector && (
            <div className="hidden min-h-0 lg:flex">
              <AccessInspector
                target={inspector}
                expanded={isInspectorExpanded}
                onRuleEditorOpenChange={setIsInspectorExpanded}
                onClose={closeInspector}
              />
            </div>
          )}
          {validationInspector && (
            <div className="hidden min-h-0 lg:flex">
              <ValidationInspector
                target={validationInspector}
                onClose={() => setValidationInspector(null)}
              />
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isAddEditSchemaModalOpen}
        onOpenChange={setIsAddEditSchemaModalOpen}
      >
        {isAddEditSchemaModalOpen && (
          <AddEditSchemaModal
            key={addEditSchemaInstance}
            mode="add"
            onSubmit={onSchemaCreate}
            onCancel={() => setIsAddEditSchemaModalOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
};
