"use client";

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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
import { MOTION, SHELL } from "../utils/motion";
import { useLingeringValue } from "../hooks/use-lingering-value";
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

  /**
   * The shell's two side columns are animated by width, not by mounting and
   * unmounting.
   *
   * The previous version swapped them through `AnimatePresence mode="wait"`,
   * which runs the outgoing panel's collapse to completion *before* starting
   * the incoming one's — so the column passed through zero width on the way
   * from the 264px explorer to the 52px rail, and the table lurched out to
   * full width and back. Driving one persistent element's width instead means
   * there is a single, monotonic 264→52 transition and the table's flex box
   * follows it in the same layout pass.
   *
   * The panels inside keep their own fixed widths and are simply clipped, so
   * nothing inside them re-wraps mid-animation.
   */
  const explorerWidth = isRightPanelOpen ? SHELL.railWidth : SHELL.explorerWidth;

  // The width the panel itself is laid out at. It never drops to 0 — only the
  // column around it does — so the panel keeps its shape while being clipped
  // away instead of reflowing its contents down to nothing on close. It
  // lingers past the close for the same reason the contents do: closing the
  // rule editor at 480px would otherwise squeeze the panel to 460px in the
  // same frame the column starts collapsing.
  const inspectorPanelWidth =
    useLingeringValue(
      isRightPanelOpen
        ? inspector && isInspectorExpanded
          ? SHELL.inspectorWidthExpanded
          : SHELL.inspectorWidth
        : null,
      MOTION.panel,
    ) ?? SHELL.inspectorWidth;

  const inspectorWidth = isRightPanelOpen ? inspectorPanelWidth : 0;

  // Contents outlive the close by exactly one collapse, so the column shrinks
  // with the panel still drawn in it rather than around an empty box.
  const lingeringInspector = useLingeringValue(inspector, MOTION.panel);
  const lingeringValidation = useLingeringValue(validationInspector, MOTION.panel);

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
          {/* ── Explorer column ──
              One box whose width transitions between the full sidebar and the
              rail. Both panels stay mounted: the sidebar sits in normal flow
              (so this column still has a height on mobile, where the rail does
              not exist) and the rail overlays it on lg. Cross-fading them in
              place, rather than swapping them, also means the sidebar's search
              box and scroll position survive a collapse. */}
          <div
            data-testid="explorer-column"
            data-collapsed={isRightPanelOpen ? "true" : "false"}
            style={
              {
                "--dg-explorer-w": `${explorerWidth}px`,
                "--dg-explorer-open-w": `${SHELL.explorerWidth}px`,
                "--dg-rail-w": `${SHELL.railWidth}px`,
              } as React.CSSProperties
            }
            className={`dg-panel-collapse relative shrink-0 overflow-hidden lg:w-[var(--dg-explorer-w)] ${
              selectedSchemaId ? "hidden lg:block" : "block"
            }`}
          >
            <div
              data-testid="explorer-sidebar-layer"
              aria-hidden={isRightPanelOpen}
              inert={isRightPanelOpen}
              style={{ opacity: isRightPanelOpen ? 0 : 1 }}
              className={`dg-fade-layer h-full w-full lg:w-[var(--dg-explorer-open-w)] ${
                isRightPanelOpen ? "pointer-events-none" : ""
              }`}
            >
              <SchemasSidebar
                onAddSchema={() => openAddSchemaModal()}
                selectedSchemaId={selectedSchemaId}
                filterType={queryParams.type ?? "all"}
                page={queryParams.page}
                pageSize={queryParams.pageSize}
                onListQueryChange={handleListQueryChange}
              />
            </div>

            <div
              data-testid="explorer-rail-layer"
              aria-hidden={!isRightPanelOpen}
              inert={!isRightPanelOpen}
              style={{ opacity: isRightPanelOpen ? 1 : 0 }}
              className={`dg-fade-layer absolute inset-y-0 left-0 hidden w-[var(--dg-rail-w)] lg:block ${
                isRightPanelOpen ? "" : "pointer-events-none"
              }`}
            >
              <SchemaRail
                filterType={queryParams.type ?? "all"}
                page={queryParams.page}
                pageSize={queryParams.pageSize}
                selectedSchemaId={selectedSchemaId}
                onSelectSchema={(id) => handleListQueryChange({ schemaId: id })}
                onExpand={closeRightPanel}
              />
            </div>
          </div>

          {/* Main content.
              Deliberately *not* animated. It is a flex child of the same row
              as the two columns, so it re-measures in the very layout pass
              their width transition drives — free, frame-accurate, and without
              running a `layout` animation over a subtree that holds the whole
              field table. */}
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
          </div>

          {/* ── Docked inspector column ──
              One slot, since Access and Validation are mutually exclusive. The
              column's width is the animated part; the panel inside is pinned
              to the right edge at the column's own target width, so a collapse
              clips it from the left — it slides out from under the table
              rather than being squeezed narrower and re-wrapping its contents
              on the way. Switching Access ⇄ Validation cross-fades in place
              instead of closing the column and reopening it. */}
          <div
            data-testid="inspector-column"
            data-open={isRightPanelOpen ? "true" : "false"}
            aria-hidden={!isRightPanelOpen}
            style={
              {
                "--dg-inspector-w": `${inspectorWidth}px`,
                "--dg-inspector-panel-w": `${inspectorPanelWidth}px`,
                opacity: isRightPanelOpen ? 1 : 0,
              } as React.CSSProperties
            }
            className={`dg-panel-collapse relative hidden min-h-0 shrink-0 overflow-hidden lg:block lg:w-[var(--dg-inspector-w)] ${
              isRightPanelOpen ? "" : "pointer-events-none"
            }`}
          >
            {lingeringInspector && (
              <div
                aria-hidden={!inspector}
                inert={!inspector}
                style={{ opacity: inspector ? 1 : 0 }}
                className={`dg-fade-layer absolute inset-y-0 right-0 flex w-[var(--dg-inspector-panel-w)] min-h-0 ${
                  inspector ? "" : "pointer-events-none"
                }`}
              >
                <AccessInspector
                  target={lingeringInspector}
                  onRuleEditorOpenChange={setIsInspectorExpanded}
                  onClose={closeInspector}
                />
              </div>
            )}

            {lingeringValidation && (
              <div
                aria-hidden={!validationInspector}
                inert={!validationInspector}
                style={{ opacity: validationInspector ? 1 : 0 }}
                className={`dg-fade-layer absolute inset-y-0 right-0 flex w-[var(--dg-inspector-panel-w)] min-h-0 ${
                  validationInspector ? "" : "pointer-events-none"
                }`}
              >
                <ValidationInspector
                  target={lingeringValidation}
                  onClose={() => setValidationInspector(null)}
                />
              </div>
            )}
          </div>
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
