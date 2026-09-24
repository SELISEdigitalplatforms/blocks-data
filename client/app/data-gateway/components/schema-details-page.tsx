"use client";

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
import { CreateFirstSchemaPanel } from "./create-first-schema-panel";
import ImportSchemaModal from "./import-schema-modal";
import { SchemaBasicInfo } from "./schema-basic-info";
import { SchemaRail } from "./schema-rail";
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
  // Set only when opened from the empty-canvas's Entity/Child cards, so the
  // modal lands on that kind instead of always defaulting to Entity.
  const [addSchemaKind, setAddSchemaKind] = useState<"Entity" | "DTO" | undefined>(
    undefined,
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalInstance, setImportModalInstance] = useState(0);
  // Lifted out of SchemaStructureTable so its trigger can sit beside the
  // Schema Access button in SchemaBasicInfo — a sibling component — instead
  // of in the field table's own header.
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  /**
   * Access, docked beside the table. It widens for the rule editor, since
   * that's the only part that needs the width; the explorer stays folded to
   * a rail for as long as any inspector — this or Validation's — is open, so
   * the table isn't fighting a sidebar it can't see past the inspector for
   * anyway.
   */
  const [inspector, setInspector] = useState<AccessInspectorTarget | null>(null);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);

  // Validations, docked the same way — the two share one column, so opening
  // either one closes the other rather than trying to fit both side by side.
  const [validationInspector, setValidationInspector] =
    useState<ValidationInspectorTarget | null>(null);

  const isRightPanelOpen = Boolean(inspector) || Boolean(validationInspector);

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

  const closeRightPanel = useCallback(() => {
    setInspector(null);
    setIsInspectorExpanded(false);
    setValidationInspector(null);
  }, []);

  // Shared by the sidebar's "+ Add" and the empty-canvas's own "New schema" /
  // Entity / Child triggers, so there's one place that remounts the form.
  const openAddSchemaModal = useCallback((kind?: "Entity" | "DTO") => {
    setAddSchemaKind(kind);
    setAddEditSchemaInstance((n) => n + 1);
    setIsAddEditSchemaModalOpen(true);
  }, []);

  const openImportModal = useCallback(() => {
    setImportModalInstance((n) => n + 1);
    setIsImportModalOpen(true);
  }, []);

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
          {/* Explorer — same recipe as the docked inspector below: `layout` +
              width 0 → "auto" → 0, so the rail/sidebar swap grows and shrinks
              the same way opening/closing Access or Validation does, rather
              than just cross-fading in place. */}
          <AnimatePresence mode="wait" initial={false}>
            {isRightPanelOpen ? (
              <motion.div
                key="rail"
                layout
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="hidden shrink-0 overflow-hidden lg:block"
              >
                <SchemaRail
                  filterType={queryParams.type ?? "all"}
                  page={queryParams.page}
                  pageSize={queryParams.pageSize}
                  selectedSchemaId={selectedSchemaId}
                  onSelectSchema={(id) => handleListQueryChange({ schemaId: id })}
                  onExpand={closeRightPanel}
                />
              </motion.div>
            ) : (
              <motion.div
                key="sidebar"
                layout
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className={`shrink-0 overflow-hidden ${selectedSchemaId ? "hidden lg:block" : "block"}`}
              >
                <SchemasSidebar
                  onAddSchema={() => openAddSchemaModal()}
                  selectedSchemaId={selectedSchemaId}
                  filterType={queryParams.type ?? "all"}
                  page={queryParams.page}
                  pageSize={queryParams.pageSize}
                  onListQueryChange={handleListQueryChange}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main content */}
          <motion.div
            layout
            transition={{ duration: 0.2, ease: "easeInOut" }}
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
              className={`${selectedSchemaId ? "flex" : "hidden"} flex-col lg:hidden`}
            >
              <SchemaBasicInfo
                {...schemaDetails}
                onDeleteSuccess={onDeleteSchema}
                isLoading={isSchemaDetailsLoading}
                onOpenPreview={() => setIsPreviewOpen(true)}
              />
              <SchemaStructureTable
                {...schemaDetails}
                isLoading={isSchemaDetailsLoading}
                onOpenStandaloneSchemaEditor={openSchemaInEditor}
                isPreviewOpen={isPreviewOpen}
                onPreviewOpenChange={setIsPreviewOpen}
              />
            </div>

            {/* Desktop */}
            <div className="hidden min-h-0 flex-1 flex-col lg:flex">
              {!selectedSchemaId ? (
                <CreateFirstSchemaPanel
                  onCreateSchema={openAddSchemaModal}
                  onImportSchema={openImportModal}
                />
              ) : (
                <>
                  <SchemaBasicInfo
                    {...schemaDetails}
                    onDeleteSuccess={onDeleteSchema}
                    isLoading={isSchemaDetailsLoading}
                    onOpenPreview={() => setIsPreviewOpen(true)}
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
                    isPreviewOpen={isPreviewOpen}
                    onPreviewOpenChange={setIsPreviewOpen}
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
                </>
              )}
            </div>
          </motion.div>

          {/* Docked inspector — one slot, since Access and Validation are
              mutually exclusive. `initial={{ width: 0 }}` + `layout` grows it
              in on mount, tracks Access's own 328↔480 resize while it's
              open, and shrinks it back to 0 on close. */}
          <AnimatePresence mode="wait" initial={false}>
            {inspector ? (
              <motion.div
                key="access-inspector"
                layout
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="hidden min-h-0 overflow-hidden lg:flex"
              >
                <AccessInspector
                  target={inspector}
                  expanded={isInspectorExpanded}
                  onRuleEditorOpenChange={setIsInspectorExpanded}
                  onClose={closeInspector}
                />
              </motion.div>
            ) : validationInspector ? (
              <motion.div
                key="validation-inspector"
                layout
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="hidden min-h-0 overflow-hidden lg:flex"
              >
                <ValidationInspector
                  target={validationInspector}
                  onClose={() => setValidationInspector(null)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
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
            defaultValues={addSchemaKind ? { schemaName: "", schemaType: addSchemaKind } : undefined}
            onSubmit={onSchemaCreate}
            onCancel={() => setIsAddEditSchemaModalOpen(false)}
          />
        )}
      </Dialog>

      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        {isImportModalOpen && (
          <ImportSchemaModal
            key={importModalInstance}
            projectKey={projectKey}
            onClose={() => setIsImportModalOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
};
