"use client";

import { Alert, AlertDescription } from "@/components/ui-kits/alert/alert";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ChevronRight } from "lucide-react";
import { DataGatewayActions } from "./data-gateway-actions";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getPolicyDataQueryOptions,
  useCreateSchema,
  useGetUnadaptedChangeLogs,
  useSchemaDetails,
} from "../hooks/use-configuration";
import { useDataGatewaySearchParams } from "../hooks/use-data-gateway-search-params";
import {
  ICreateSchemaDefaultValues,
  ICreateSchemaPayload,
  ISchemaDetails,
} from "../models/data-service";
import { Schema } from "../models/security-and-performance";
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
import SecurityAndPerformance from "./security-and-performance/security-and-performance";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddEditSchemaModalOpen, setIsAddEditSchemaModalOpen] =
    useState(false);

  // URL-based view state:
  //   type = null  → security & performance landing (no query params in URL)
  //   type = "all" → schema two-panel view
  const [queryParams, setQueryParams] = useDataGatewaySearchParams();

  const handleListQueryChange = useCallback(
    (update: DataGatewayListQueryUpdate) => {
      setQueryParams(update, { history: "push" });
    },
    [setQueryParams],
  );

  const isSchemaView = queryParams.type !== null;
  const selectedSchemaId = queryParams.schemaId;

  const selectedProject = useProjectStore().selectedProject;
  const projectKey = selectedProject?.tenantId ?? "";
  const projectShortKey = selectedProject?.tenantSlug ?? "";
  const { data: unAdaptedChangeLogs } = useGetUnadaptedChangeLogs({
    projectKey,
  });
  const hasUnadaptedChanges =
    unAdaptedChangeLogs?.data != undefined &&
    unAdaptedChangeLogs.data.length > 0;

  const [schemaDetails, setSchemaDetails] = useState<ISchemaDetails>({
    ...EMPTY_SCHEMA,
    projectKey,
  });

  const { data: schemaDetailsQuery, isLoading: isSchemaDetailsLoading } =
    useSchemaDetails(selectedSchemaId ?? "", projectKey, {
      enabled: isSchemaView,
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

  const navigateToSchemaView = (schema: Schema) => {
    openSchemaInEditor(schema.id || null);
  };

  const navigateToSecurityView = () => {
    queryClient.invalidateQueries({
      queryKey: ["security-performance-schema-list"],
    });
    navigate({ pathname: "/services/data-gateway" });
  };

  // Warm policy cache for access drawers (query key is parent schemaName for all column rules).
  useEffect(() => {
    if (!isSchemaView || !selectedSchemaId || !projectKey) return;
    const schemaName = schemaDetailsQuery?.data?.schemaName;
    if (!schemaName) return;
    void queryClient.prefetchQuery(
      getPolicyDataQueryOptions(schemaName, projectKey),
    );
  }, [
    isSchemaView,
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          {isSchemaView ? (
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
              <button
                className="transition-colors hover:text-foreground"
                onClick={() => navigateToSecurityView()}
              >
                Data Gateway
              </button>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">Schemas</span>
            </nav>
          ) : (
            <p className="text-sm font-semibold text-foreground">Data Gateway</p>
          )}

          {/* Action buttons */}
          <DataGatewayActions />
        </div>

        {/* Server status alert — only shown on schema view */}
        {isSchemaView && hasUnadaptedChanges && (
          <Alert className="flex flex-col items-center justify-center gap-1 rounded-sm border border-base-error bg-blocks-error-100 px-4 py-4 text-base font-normal text-blocks-error-800 md:flex-row">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You have unadapted changes, please click on the Publish button to
              adapt them.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Security landing view ── */}
        {!isSchemaView ? (
          <SecurityAndPerformance
            onSchemaRowClick={navigateToSchemaView}
            onSchemaCreated={(schemaId) => openSchemaInEditor(schemaId)}
            onNavigateToSchemas={() =>
              setQueryParams(
                { type: "all", page: 1, pageSize: 10, schemaId: null },
                { history: "push" },
              )
            }
          />
        ) : (
          /* ── Schema two-panel view ── */
          <>
            <div className="flex flex-col gap-4 pt-0 lg:h-[calc(100vh-154px)] lg:flex-row lg:items-stretch">
              {/* Sidebar */}
              <div
                className={`shrink-0 ${selectedSchemaId ? "hidden lg:block" : "block"}`}
              >
                <SchemasSidebar
                  onAddSchema={() => setIsAddEditSchemaModalOpen(true)}
                  selectedSchemaId={selectedSchemaId}
                  filterType={queryParams.type ?? "all"}
                  page={queryParams.page}
                  pageSize={queryParams.pageSize}
                  onListQueryChange={handleListQueryChange}
                />
              </div>

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
                  />
                  <SchemaStructureTable
                    {...schemaDetails}
                    isLoading={isSchemaDetailsLoading}
                    onOpenStandaloneSchemaEditor={openSchemaInEditor}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={isAddEditSchemaModalOpen}
        onOpenChange={setIsAddEditSchemaModalOpen}
      >
        <AddEditSchemaModal
          mode="add"
          onSubmit={onSchemaCreate}
          onCancel={() => setIsAddEditSchemaModalOpen(false)}
        />
      </Dialog>

    </>
  );
};
