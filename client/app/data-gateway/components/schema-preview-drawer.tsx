"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { useGetProject } from "@/hooks/use-project";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { Eye, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import { SchemaPreviewDrawerProps } from "../models/schema-preview.types";
import { buildEntityShape } from "../rest/entity-shape";
import { formatPreviewJson } from "../utils/graphql-template.utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { ProtocolSwitch, type Protocol } from "./playground/protocol-switch";
import { GraphQLPreviewPanel } from "./schema-preview/graphql-preview-panel";
import { OperationRail } from "./schema-preview/operation-rail";
import type { OperationGroup } from "./schema-preview/operations";
import { PreviewEmptyState } from "./schema-preview/preview-empty-state";
import { RestPreviewPanel } from "./schema-preview/rest-preview-panel";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

export function SchemaPreviewDrawer({
  trigger,
  previewData,
  schemaName,
  schemaType,
  title,
  className,
  open,
  onOpenChange,
  rawIntrospection: rawIntrospectionProp,
  isGatewayIntrospectionPending: isGatewayIntrospectionPendingProp,
  isGatewayIntrospectionFetching: isGatewayIntrospectionFetchingProp,
  schemaDetails,
  allSchemas,
  liveState = null,
}: SchemaPreviewDrawerProps) {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const selectedProject = useProjectStore().selectedProject;
  const { setSelectedProject } = useProjectStore();
  const { data: projectData } = useGetProject({
    projectId: selectedProject?.itemId || "",
  });
  const projectShortKey = selectedProject?.tenantSlug || "";
  const projectKey = selectedProject?.tenantId || "";

  useEffect(() => {
    if (projectData?.data && selectedProject?.itemId === projectData.data.itemId) {
      setSelectedProject(projectData.data);
    }
  }, [projectData, selectedProject?.itemId, setSelectedProject]);

  const isEntity = schemaType === 1;
  const defaultTab = isEntity ? "request-format" : "schema-structure";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [activeOperationTab, setActiveOperationTab] = useState<OperationGroup>("query");
  const requestUrl = getRuntimeEnv("BLOCKS_GRAPHQL_PUBLIC_URL");

  // REST is selected each time the drawer opens, whether a host opens it or its own trigger does.
  const [protocol, setProtocol] = useState<Protocol>("rest");
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setProtocol("rest");
  }
  const handleOpenChange = (next: boolean) => {
    if (next) setProtocol("rest");
    onOpenChange?.(next);
  };

  const [prevIsEntity, setPrevIsEntity] = useState<boolean | null>(null);
  if (isEntity !== prevIsEntity) {
    setPrevIsEntity(isEntity);
    setActiveTab(isEntity ? "request-format" : "schema-structure");
  }

  const formattedJson = useMemo(() => formatPreviewJson(previewData), [previewData]);

  const rawIntrospection = rawIntrospectionProp;
  const isGatewayIntrospectionFetching = isGatewayIntrospectionFetchingProp ?? false;
  const isGatewayIntrospectionPending = isGatewayIntrospectionPendingProp ?? false;

  const isGatewaySchemaLoading =
    isEntity &&
    !!schemaName &&
    !!projectShortKey &&
    !!rawIntrospectionProp &&
    (isGatewayIntrospectionPending ||
      (isGatewayIntrospectionFetching && rawIntrospection === undefined));

  const schemaDetailsName = schemaDetails?.schemaName;
  const schemaDetailsFields = schemaDetails?.fields;
  const shape = useMemo(
    () =>
      schemaDetailsName && schemaDetailsFields
        ? buildEntityShape({ schemaName: schemaDetailsName, fields: schemaDetailsFields }, allSchemas ?? [])
        : null,
    [schemaDetailsName, schemaDetailsFields, allSchemas],
  );

  const heading = title ?? t("SCHEMA_PREVIEW_DRAWER.SCHEMANAME_PREVIEW", { schemaName: schemaName ?? t("SCHEMA_PREVIEW_DRAWER.SCHEMA") });

  return (
    <Drawer direction="right" handleOnly open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        onCloseAutoFocus={handleCloseAutoFocus}
        // Lighter than the shared 80% scrim so the schema behind stays readable.
        overlayClassName="bg-black/40"
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l border-border/40 bg-background md:w-[48vw] md:max-w-2xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className,
        )}
        style={{ userSelect: "text" }}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          {/* Ambient gradient */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.05),transparent_55%)]" />

          {/* Drawer header */}
          <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
            <DrawerTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Eye className="h-4 w-4 text-indigo-400" />
              {heading}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("SCHEMA_PREVIEW_DRAWER.PREVIEW_SCHEMA_PAYLOAD_AND_REQUEST")}
            </DrawerDescription>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label={t("common:CLOSE")}
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="relative flex flex-1 flex-col overflow-hidden"
          >
            {/* Tab switcher */}
            {isEntity && (
              <div className="shrink-0 border-b border-border/40 px-6 pt-3">
                <TabsList className="h-8 gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="request-format"
                    className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs text-foreground/70 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t("SCHEMA_PREVIEW_DRAWER.REQUEST_FORMAT")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="schema-structure"
                    className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs text-foreground/70 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t("SCHEMA_PREVIEW_DRAWER.SCHEMA_STRUCTURE")}
                  </TabsTrigger>
                </TabsList>
              </div>
            )}

            {/* Schema Structure */}
            <TabsContent value="schema-structure" className="flex-1 overflow-hidden p-6">
              <div className="group relative h-full">
                <div className="absolute right-4 top-3 z-50 opacity-0 transition-opacity group-hover:opacity-100">
                  <CopyToClipboardButton textToCopy={formattedJson}> </CopyToClipboardButton>
                </div>
                <ScrollArea className="h-full rounded-sm border border-border/60 bg-muted/30 pr-4">
                  <div className="block p-5 pr-20 dark:hidden">
                    <SyntaxHighlighter
                      language="json"
                      style={prism}
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        padding: 0,
                        fontSize: "0.75rem",
                        lineHeight: 1.6,
                      }}
                      wrapLongLines
                    >
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                  <div className="hidden p-5 pr-20 dark:block">
                    <SyntaxHighlighter
                      language="json"
                      style={atomDark}
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        padding: 0,
                        fontSize: "0.75rem",
                        lineHeight: 1.6,
                      }}
                      wrapLongLines
                    >
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Request Format */}
            <TabsContent value="request-format" className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border/40 px-6 py-3">
                <ProtocolSwitch value={protocol} onChange={setProtocol} />
              </div>

              {/* Operations layout */}
              <div className="flex flex-1 overflow-hidden">
                <OperationRail value={activeOperationTab} onChange={setActiveOperationTab} />

                <div className="flex flex-1 flex-col overflow-hidden">
                  {protocol === "rest" ? (
                    shape ? (
                      <RestPreviewPanel
                        shape={shape}
                        liveState={liveState}
                        publicBaseUrl={requestUrl}
                        blocksKey={projectKey}
                        operationGroup={activeOperationTab}
                      />
                    ) : (
                      <div className="p-4">
                        <PreviewEmptyState operationGroup={activeOperationTab} />
                      </div>
                    )
                  ) : (
                    <>
                      {/* Connection info */}
                      <div className="shrink-0 space-y-2 border-b border-border/40 px-4 py-3">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-foreground">
                            {t("SCHEMA_PREVIEW_DRAWER.URL")}
                          </span>
                          <CopyToClipboardButton textToCopy={requestUrl} isHoverable>
                            <code className="font-mono text-foreground">{requestUrl}</code>
                          </CopyToClipboardButton>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-foreground">
                            {t("SCHEMA_PREVIEW_DRAWER.HEADER")}
                          </span>
                          <CopyToClipboardButton textToCopy={`x-blocks-key: ${projectKey}`} isHoverable>
                            <code className="font-mono text-foreground">x-blocks-key: {projectKey}</code>
                          </CopyToClipboardButton>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <GraphQLPreviewPanel
                          rawIntrospection={rawIntrospection}
                          schemaName={schemaName}
                          operationGroup={activeOperationTab}
                          isLoading={isGatewaySchemaLoading}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
