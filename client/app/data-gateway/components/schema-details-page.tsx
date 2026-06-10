"use client";

import { Alert, AlertDescription } from "@/components/ui-kits/alert/alert";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Download,
  FolderInput,
  MoreVertical,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getStoredInitiatedAt,
  INIT_STORAGE_PREFIX,
  POLL_INTERVAL,
  POLL_START_DELAY,
} from "../constants/schema-access-control";
import {
  getPolicyDataQueryOptions,
  useCreateSchema,
  useGetDataServiceConfiguration,
  useGetPodActiveStatus,
  useGetUnadaptedChangeLogs,
  useSchemaDetails,
} from "../hooks/use-configuration";
import { useDataGatewaySearchParams } from "../hooks/use-data-gateway-search-params";
import {
  ICreateSchemaDefaultValues,
  ICreateSchemaPayload,
  IDataSourceResponse,
  ISchemaDetails,
} from "../models/data-service";
import { Schema } from "../models/security-and-performance";
import {
  createEmptyAccessRuleSet,
  normalizeAccessRuleSet,
} from "../utils/schema-access.utils";
import { normalizeSchemaFields } from "../utils/schema-normalization";
import { AddEditSchemaModal } from "./add-edit-schema";
import ConfigureDataSourceModal from "./configure-data-source";
import ExportSchemaModal from "./export-schema/export-schema-modal";
import ImportSchemaModal from "./import-schema-modal";
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
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isOpenImportSchemaModal, setIsOpenImportSchemaModal] = useState(false);

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

  const [initiatedAt, setInitiatedAt] = useState<number | null>(() =>
    getStoredInitiatedAt(projectKey),
  );
  const [shouldPoll, setShouldPoll] = useState(() => {
    if (!initiatedAt) return false;
    return Date.now() - initiatedAt >= POLL_START_DELAY;
  });

  const { data: message, isPending: isPodStatusLoading } =
    useGetPodActiveStatus({
      slug: projectShortKey,
      refetchInterval: shouldPoll && initiatedAt ? POLL_INTERVAL : false,
    });
  const isServerActive = !!message?.status;
  const isServerInitiating = initiatedAt !== null && !isServerActive;

  const [schemaDetails, setSchemaDetails] = useState<ISchemaDetails>({
    ...EMPTY_SCHEMA,
    projectKey,
  });

  const { data: schemaDetailsQuery, isLoading: isSchemaDetailsLoading } =
    useSchemaDetails(selectedSchemaId ?? "", projectKey, {
      enabled: isSchemaView,
    });
  const { data: configData } = useGetDataServiceConfiguration();
  const { mutateAsync: createSchema } = useCreateSchema();

  const onSchemaCreate = async (
    values: ICreateSchemaDefaultValues,
  ): Promise<boolean> => {
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

  // Start polling after 2 minutes of server initiation
  useEffect(() => {
    if (!initiatedAt || shouldPoll || isServerActive) return;
    const remaining = POLL_START_DELAY - (Date.now() - initiatedAt);
    if (remaining <= 0) {
      setShouldPoll(true);
      return;
    }
    const timer = setTimeout(() => setShouldPoll(true), remaining);
    return () => clearTimeout(timer);
  }, [initiatedAt, shouldPoll, isServerActive]);

  // Clear initiation state when server becomes active
  useEffect(() => {
    if (isServerActive && initiatedAt) {
      localStorage.removeItem(`${INIT_STORAGE_PREFIX}${projectKey}`);
      setInitiatedAt(null);
      setShouldPoll(false);
    }
  }, [isServerActive, initiatedAt, projectKey]);

  const handleServerStart = () => {
    const now = Date.now();
    localStorage.setItem(
      `${INIT_STORAGE_PREFIX}${projectKey}`,
      JSON.stringify({ initiatedAt: now }),
    );
    setInitiatedAt(now);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          {isSchemaView && (
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
              <button
                className="hover:text-foreground"
                onClick={() => navigateToSecurityView()}
              >
                Data Gateway
              </button>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">Schemas</span>
            </nav>
          )}
          <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
            <div className="flex w-full justify-end gap-2 xl:items-center">
              <div className="shrink-0 xl:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label="Open Data Gateway actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() =>
                        navigate("/services/data-gateway/playground")
                      }
                    >
                      Playground
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setIsOpenImportSchemaModal(true)}
                    >
                      <FolderInput className="mr-2 h-4 w-4" />
                      Import
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setIsExportModalOpen(true)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setIsConfigureModalOpen(true)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="hidden shrink-0 items-center gap-2 xl:flex">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsOpenImportSchemaModal(true)}
                  className="flex items-center gap-2"
                >
                  <FolderInput className="h-4 w-4" />
                  Import
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setIsExportModalOpen(true)}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/services/data-gateway/playground")}
                >
                  Playground
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-sm font-medium"
                  onClick={() => setIsConfigureModalOpen(true)}
                >
                  <Settings className="h-5 w-5" />
                  <span className="sr-only sm:not-sr-only">Configure</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Server status alert — only shown on schema view */}
        {isSchemaView &&
          (!isPodStatusLoading && !isServerActive ? (
            <Alert className="flex flex-col items-center justify-center gap-1 rounded-sm border border-base-error bg-blocks-error-100 px-4 py-4 text-base font-normal text-blocks-error-800 md:flex-row">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {isServerInitiating
                  ? "Data Gateway server is starting up. This may take 1-5 minutes..."
                  : "Data Gateway server is inactive. Please click the Start button to activate it."}
              </AlertDescription>
            </Alert>
          ) : (
            hasUnadaptedChanges && (
              <Alert className="flex flex-col items-center justify-center gap-1 rounded-sm border border-base-error bg-blocks-error-100 px-4 py-4 text-base font-normal text-blocks-error-800 md:flex-row">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You have unadapted changes, please click on the Publish button
                  to adapt them.
                </AlertDescription>
              </Alert>
            )
          ))}

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
            <div className="flex flex-col gap-6 rounded pt-0 lg:flex-row lg:items-start">
              {/* Sidebar */}
              <div
                className={`shrink-0 ${selectedSchemaId ? "hidden lg:block" : "block"}`}
              >
                <SchemasSidebar
                  onAddSchema={() => setIsAddEditSchemaModalOpen(true)}
                  selectedSchemaId={selectedSchemaId}
                  isServerActive={isServerActive}
                  isServerInitiating={isServerInitiating}
                  isPodStatusLoading={isPodStatusLoading}
                  onServerStart={handleServerStart}
                  filterType={queryParams.type ?? "all"}
                  page={queryParams.page}
                  pageSize={queryParams.pageSize}
                  onListQueryChange={handleListQueryChange}
                />
              </div>

              {/* Main content */}
              <div
                className={`flex w-full min-w-0 flex-col gap-4 lg:flex-1 ${
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
                <div className="hidden flex-col gap-4 lg:flex">
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

      <Dialog
        open={isConfigureModalOpen}
        onOpenChange={setIsConfigureModalOpen}
      >
        <ConfigureDataSourceModal
          mode="edit"
          initialData={configData?.data as IDataSourceResponse}
          onCancel={() => setIsConfigureModalOpen(false)}
          onConfirm={() => setIsConfigureModalOpen(false)}
        />
      </Dialog>

      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <ExportSchemaModal onClose={() => setIsExportModalOpen(false)} />
      </Dialog>

      <Dialog
        open={isOpenImportSchemaModal}
        onOpenChange={setIsOpenImportSchemaModal}
      >
        <ImportSchemaModal
          projectKey={projectKey}
          onClose={() => setIsOpenImportSchemaModal(false)}
        />
      </Dialog>
    </>
  );
};
