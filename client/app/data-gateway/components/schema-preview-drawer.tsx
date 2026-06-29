"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
import { Button } from "@/components/ui-kits/button/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui-kits/tabs/tabs";
import { useGetProject } from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import { useRawIntrospectionQuery } from "../hooks/use-configuration";
import { SchemaPreviewDrawerProps } from "../models/schema-preview.types";
import { buildPreviewSections } from "../utils/generate-preview-queries";
import { formatPreviewJson } from "../utils/graphql-template.utils";
import { getGraphqlGatewayExecuteOrigin } from "@/constants/endpoint.constant";

const OPERATIONS = [
  {
    value: "query",
    label: "Query",
    icon: Search,
    iconColor: "text-blue-500",
    activeBg: "bg-blue-50 dark:bg-blue-950/50",
    activeText: "text-blue-700 dark:text-blue-300",
    indicatorColor: "bg-blue-500",
    badgeBg: "bg-blue-500/10 text-blue-700 border border-blue-400/30 dark:text-blue-300/80 dark:border-blue-500/20",
    sectionBorder: "border-l-2 border-blue-400/50",
  },
  {
    value: "insert",
    label: "Insert",
    icon: Plus,
    iconColor: "text-emerald-500",
    activeBg: "bg-emerald-50 dark:bg-emerald-950/50",
    activeText: "text-emerald-700 dark:text-emerald-300",
    indicatorColor: "bg-emerald-500",
    badgeBg: "bg-emerald-500/10 text-emerald-700 border border-emerald-400/30 dark:text-emerald-300/80 dark:border-emerald-500/20",
    sectionBorder: "border-l-2 border-emerald-400/50",
  },
  {
    value: "update",
    label: "Update",
    icon: Pencil,
    iconColor: "text-amber-500",
    activeBg: "bg-amber-50 dark:bg-amber-950/50",
    activeText: "text-amber-700 dark:text-amber-300",
    indicatorColor: "bg-amber-500",
    badgeBg: "bg-amber-500/10 text-amber-700 border border-amber-400/30 dark:text-amber-300/80 dark:border-amber-500/20",
    sectionBorder: "border-l-2 border-amber-400/50",
  },
  {
    value: "delete",
    label: "Delete",
    icon: Trash2,
    iconColor: "text-red-500",
    activeBg: "bg-red-50 dark:bg-red-950/50",
    activeText: "text-red-700 dark:text-red-300",
    indicatorColor: "bg-red-500",
    badgeBg: "bg-rose-500/10 text-rose-700 border border-rose-400/30 dark:text-rose-300/80 dark:border-rose-500/20",
    sectionBorder: "border-l-2 border-red-400/50",
  },
] as const;

export function SchemaPreviewDrawer({
  trigger,
  previewData,
  schemaName,
  schemaType,
  title,
  className,
  open,
  onOpenChange,
}: SchemaPreviewDrawerProps) {
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
  const [activeOperationTab, setActiveOperationTab] = useState<string>("query");
  const requestUrl = `${getGraphqlGatewayExecuteOrigin()}/api/gateway`;
  const navigate = useNavigate();

  useEffect(() => {
    setActiveTab(isEntity ? "request-format" : "schema-structure");
  }, [isEntity]);

  const operationTabMap: Record<string, string[]> = {
    query: ["Query"],
    insert: ["Insert", "Insert Many"],
    update: ["Update"],
    delete: ["Delete"],
  };

  const handleTryInPlayground = (code: string) => {
    localStorage.setItem("graphql-playground-query", code);
    // Navigate to the playground
    navigate("/app/services/data-gateway/playground");
  };

  const formattedJson = useMemo(() => formatPreviewJson(previewData), [previewData]);

  const { data: rawIntrospection, isFetching: isGatewayIntrospectionFetching, isPending: isGatewayIntrospectionPending } =
    useRawIntrospectionQuery({ projectShortKey, enabled: isEntity && !!schemaName });

  const isGatewaySchemaLoading =
    isEntity && !!schemaName && !!projectShortKey &&
    (isGatewayIntrospectionPending || (isGatewayIntrospectionFetching && rawIntrospection === undefined));

  const sections = useMemo(
    () => rawIntrospection && schemaName ? buildPreviewSections(rawIntrospection, schemaName) : [],
    [schemaName, rawIntrospection],
  );

  const filteredSections = useMemo(() => {
    const allowedTitles = operationTabMap[activeOperationTab] || [];
    return sections.filter((s) => allowedTitles.includes(s.title));
  }, [sections, activeOperationTab]);

  const activeOperation = OPERATIONS.find((op) => op.value === activeOperationTab) ?? OPERATIONS[0];
  const heading = title ?? `${schemaName ?? "Schema"} preview`;

  return (
    <Drawer direction="right" handleOnly open={open} onOpenChange={onOpenChange}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        onCloseAutoFocus={handleCloseAutoFocus}
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
            <DrawerTitle className="text-sm font-semibold text-foreground">
              {heading}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Preview schema payload and request examples.
            </DrawerDescription>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="relative flex flex-1 flex-col overflow-hidden">

            {/* Tab switcher */}
            {isEntity && (
              <div className="shrink-0 border-b border-border/40 px-6 pt-3">
                <TabsList className="h-8 gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="request-format"
                    className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs text-foreground/70 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Request Format
                  </TabsTrigger>
                  <TabsTrigger
                    value="schema-structure"
                    className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs text-foreground/70 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Schema Structure
                  </TabsTrigger>
                </TabsList>
              </div>
            )}

            {/* Schema Structure */}
            <TabsContent value="schema-structure" className="flex-1 overflow-hidden p-6">
              <div className="group relative h-full">
                <div className="absolute right-4 top-3 z-50 opacity-0 transition-opacity group-hover:opacity-100">
                  <CopyToClipboardButton textToCopy={formattedJson}>{" "}</CopyToClipboardButton>
                </div>
                <ScrollArea className="h-full rounded-sm border border-border/60 bg-muted/30 pr-4">
                  <div className="block p-5 pr-20 dark:hidden">
                    <SyntaxHighlighter language="json" style={prism} customStyle={{ margin: 0, background: "transparent", padding: 0, fontSize: "0.75rem", lineHeight: 1.6 }} wrapLongLines>
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                  <div className="hidden p-5 pr-20 dark:block">
                    <SyntaxHighlighter language="json" style={atomDark} customStyle={{ margin: 0, background: "transparent", padding: 0, fontSize: "0.75rem", lineHeight: 1.6 }} wrapLongLines>
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Request Format */}
            <TabsContent value="request-format" className="flex flex-1 flex-col overflow-hidden">

              {/* Connection info */}
              <div className="shrink-0 space-y-2 border-b border-border/40 px-6 py-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-foreground">URL</span>
                  <CopyToClipboardButton textToCopy={requestUrl} isHoverable>
                    <code className="font-mono text-foreground">{requestUrl}</code>
                  </CopyToClipboardButton>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-foreground">Header</span>
                  <CopyToClipboardButton textToCopy={`x-blocks-key: ${projectKey}`} isHoverable>
                    <code className="font-mono text-foreground">x-blocks-key: {projectKey}</code>
                  </CopyToClipboardButton>
                </div>
              </div>

              {/* Operations layout */}
              <div className="flex flex-1 overflow-hidden">

                {/* Vertical sidebar */}
                <div className="flex shrink-0 flex-col border-r border-border/40 py-2">
                  {OPERATIONS.map(({ value, label, icon: Icon, iconColor, indicatorColor }) => {
                    const isActive = activeOperationTab === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setActiveOperationTab(value)}
                        className={cn(
                          "relative flex w-16 flex-col items-center gap-1.5 px-1 py-3 text-xs font-medium outline-none transition-all duration-150",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/70 hover:bg-muted/40 hover:text-foreground",
                        )}
                      >
                        {isActive && (
                          <span className={cn("absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-l-full", indicatorColor)} />
                        )}
                        <Icon className={cn("h-4 w-4 transition-colors", isActive ? iconColor : "text-foreground/60")} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Code content */}
                <div className="flex flex-1 flex-col overflow-hidden">
                  {isGatewaySchemaLoading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-foreground/80">
                      <span className="inline-block size-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
                      <span className="text-xs">Loading from gateway…</span>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="space-y-3 p-4">
                        {filteredSections.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-16 text-foreground/70">
                            <activeOperation.icon className={cn("h-7 w-7 opacity-40", activeOperation.iconColor)} />
                            <span className="text-xs text-foreground/70">No examples available</span>
                          </div>
                        ) : (
                          filteredSections.map((section) => (
                            <div
                              key={section.title}
                              className={cn(
                                "overflow-hidden rounded-sm border border-border/60 bg-card",
                                activeOperation.sectionBorder,
                              )}
                            >
                              {/* Section header */}
                              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", activeOperation.badgeBg)}>
                                    {section.title}
                                  </span>
                                  {section.description && (
                                    <span className="text-xs text-foreground/70">{section.description}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 gap-1 px-2 text-xs text-foreground/80 hover:text-foreground"
                                    onClick={() => handleTryInPlayground(section.code)}
                                  >
                                    <Play className="h-3 w-3" />
                                    Playground
                                  </Button>
                                  <CopyToClipboardButton textToCopy={section.code}>{" "}</CopyToClipboardButton>
                                </div>
                              </div>

                              {/* Code block */}
                              <div className="block bg-gray-50 dark:hidden">
                                <SyntaxHighlighter
                                  language="graphql"
                                  style={prism}
                                  customStyle={{ margin: 0, background: "transparent", padding: "14px 16px", fontSize: "0.775rem", lineHeight: 1.6 }}
                                  wrapLongLines
                                >
                                  {section.code}
                                </SyntaxHighlighter>
                              </div>
                              <div className="hidden bg-[#0f0f19] dark:block">
                                <SyntaxHighlighter
                                  language="graphql"
                                  style={atomDark}
                                  customStyle={{ margin: 0, background: "transparent", padding: "14px 16px", fontSize: "0.775rem", lineHeight: 1.6 }}
                                  wrapLongLines
                                >
                                  {section.code}
                                </SyntaxHighlighter>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
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
