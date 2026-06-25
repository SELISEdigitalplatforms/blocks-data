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
import { Link, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import { useRawIntrospectionQuery } from "../hooks/use-configuration";
import { SchemaPreviewDrawerProps } from "../models/schema-preview.types";
import { buildPreviewSections } from "../utils/generate-preview-queries";
import { formatPreviewJson } from "../utils/graphql-template.utils";

const OPERATIONS = [
  {
    value: "query",
    label: "Query",
    icon: Search,
    iconColor: "text-blue-500",
    activeBg: "bg-blue-50 dark:bg-blue-950/50",
    activeText: "text-blue-700 dark:text-blue-300",
    indicatorColor: "bg-blue-500",
    badgeBg: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    sectionBorder: "border-l-2 border-blue-400/60",
  },
  {
    value: "insert",
    label: "Insert",
    icon: Plus,
    iconColor: "text-emerald-500",
    activeBg: "bg-emerald-50 dark:bg-emerald-950/50",
    activeText: "text-emerald-700 dark:text-emerald-300",
    indicatorColor: "bg-emerald-500",
    badgeBg:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    sectionBorder: "border-l-2 border-emerald-400/60",
  },
  {
    value: "update",
    label: "Update",
    icon: Pencil,
    iconColor: "text-amber-500",
    activeBg: "bg-amber-50 dark:bg-amber-950/50",
    activeText: "text-amber-700 dark:text-amber-300",
    indicatorColor: "bg-amber-500",
    badgeBg:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    sectionBorder: "border-l-2 border-amber-400/60",
  },
  {
    value: "delete",
    label: "Delete",
    icon: Trash2,
    iconColor: "text-red-500",
    activeBg: "bg-red-50 dark:bg-red-950/50",
    activeText: "text-red-700 dark:text-red-300",
    indicatorColor: "bg-red-500",
    badgeBg: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    sectionBorder: "border-l-2 border-red-400/60",
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
    if (
      projectData?.data &&
      selectedProject?.itemId === projectData.data.itemId
    ) {
      setSelectedProject(projectData.data);
    }
  }, [projectData, selectedProject?.itemId, setSelectedProject]);

  const isEntity = schemaType === 1;
  const defaultTab = isEntity ? "request-format" : "schema-structure";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [activeOperationTab, setActiveOperationTab] =
    useState<string>("query");
  const requestUrl = "https://dev-data.blocksdevelopers.com/api/gateway";
  const blocksKey = "Dc4ec8f0355454e66be225a7ddb8dfd7b";
  const navigate = useNavigate();

  useEffect(() => {
    const newDefaultTab = isEntity ? "request-format" : "schema-structure";
    setActiveTab(newDefaultTab);
  }, [isEntity]);

  const operationTabMap: Record<string, string[]> = {
    query: ["Query"],
    insert: ["Insert", "Insert Many"],
    update: ["Update"],
    delete: ["Delete"],
  };

  const handleTryInPlayground = (code: string) => {
    localStorage.setItem("graphql-playground-query", code);
    navigate("/services/data-gateway/playground");
  };

  const formattedJson = useMemo(
    () => formatPreviewJson(previewData),
    [previewData],
  );

  const {
    data: rawIntrospection,
    isFetching: isGatewayIntrospectionFetching,
    isPending: isGatewayIntrospectionPending,
  } = useRawIntrospectionQuery({
    projectShortKey,
    enabled: isEntity && !!schemaName,
  });

  const isGatewaySchemaLoading =
    isEntity &&
    !!schemaName &&
    !!projectShortKey &&
    (isGatewayIntrospectionPending ||
      (isGatewayIntrospectionFetching && rawIntrospection === undefined));

  const sections = useMemo(
    () =>
      rawIntrospection && schemaName
        ? buildPreviewSections(rawIntrospection, schemaName)
        : [],
    [schemaName, rawIntrospection],
  );

  const filteredSections = useMemo(() => {
    const allowedTitles = operationTabMap[activeOperationTab] || [];
    return sections.filter((section) => allowedTitles.includes(section.title));
  }, [sections, activeOperationTab]);

  const activeOperation =
    OPERATIONS.find((op) => op.value === activeOperationTab) ?? OPERATIONS[0];
  const heading = title ?? `${schemaName ?? "Schema"} preview`;

  return (
    <Drawer
      direction="right"
      handleOnly
      open={open}
      onOpenChange={onOpenChange}
    >
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l bg-background p-6 md:w-[70vw] md:max-w-4xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className,
        )}
        style={{ userSelect: "text" }}
      >
        <div className="flex h-full flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <DrawerTitle className="text-lg font-semibold leading-none tracking-tight">
              {heading}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Preview schema payload and request examples.
            </DrawerDescription>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label="Close schema preview drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-6 flex flex-1 flex-col overflow-hidden"
          >
            {isEntity ? (
              <TabsList className="w-full flex-shrink-0 justify-start bg-muted/60 p-1 md:max-w-md">
                <TabsTrigger value="request-format" className="flex-1">
                  Request Format
                </TabsTrigger>
                <TabsTrigger value="schema-structure" className="flex-1">
                  Schema Structure
                </TabsTrigger>
              </TabsList>
            ) : null}

            {/* Schema Structure Tab */}
            <TabsContent
              value="schema-structure"
              className="mt-4 flex-1 overflow-hidden"
            >
              <div className="group relative h-full">
                <div className="absolute right-6 top-2 z-50 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <CopyToClipboardButton textToCopy={formattedJson}>
                    {" "}
                  </CopyToClipboardButton>
                </div>
                <ScrollArea className="h-full rounded-lg border border-border/60 bg-gray-50 pr-4 dark:bg-gray-900">
                  <div className="block p-6 pr-24 dark:hidden">
                    <SyntaxHighlighter
                      language="json"
                      style={prism}
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        padding: 0,
                        fontSize: "0.75rem",
                        lineHeight: 1.5,
                      }}
                      wrapLongLines
                    >
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                  <div className="hidden p-6 pr-24 dark:block">
                    <SyntaxHighlighter
                      language="json"
                      style={atomDark}
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        padding: 0,
                        fontSize: "0.75rem",
                        lineHeight: 1.5,
                      }}
                      wrapLongLines
                    >
                      {formattedJson}
                    </SyntaxHighlighter>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Request Format Tab */}
            <TabsContent
              value="request-format"
              className="mt-4 flex flex-1 flex-col gap-3 overflow-hidden"
            >
              {/* Connection info card */}
              <div className="flex-shrink-0 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Link className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium">URL</span>
                    <CopyToClipboardButton textToCopy={requestUrl} isHoverable>
                      <code className="rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground">
                        {requestUrl}
                      </code>
                    </CopyToClipboardButton>
                  </div>
                  <div className="h-3.5 w-px bg-border/60 max-sm:hidden" />
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs font-medium">Header</span>
                    <CopyToClipboardButton
                      textToCopy={`x-blocks-key: ${blocksKey}`}
                      isHoverable
                    >
                      <code className="rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground">
                        x-blocks-key: {blocksKey}
                      </code>
                    </CopyToClipboardButton>
                  </div>
                </div>
              </div>

              {/* Operations — vertical tabs + content */}
              <div className="flex flex-1 gap-3 overflow-hidden">
                {/* Vertical sidebar */}
                <div className="flex flex-shrink-0 flex-col gap-0.5 rounded-xl border border-border/50 bg-muted/30 p-1.5">
                  {OPERATIONS.map(
                    ({
                      value,
                      label,
                      icon: Icon,
                      iconColor,
                      activeBg,
                      activeText,
                      indicatorColor,
                    }) => {
                      const isActive = activeOperationTab === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setActiveOperationTab(value)}
                          className={cn(
                            "relative flex w-[3.75rem] flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-xs font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? cn(activeBg, activeText, "shadow-sm")
                              : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                          )}
                        >
                          {isActive && (
                            <span
                              className={cn(
                                "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full",
                                indicatorColor,
                              )}
                            />
                          )}
                          <Icon
                            className={cn(
                              "h-4 w-4 transition-colors duration-150",
                              isActive ? iconColor : "opacity-60",
                            )}
                          />
                          <span>{label}</span>
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Content panel */}
                <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border/50">
                  {isGatewaySchemaLoading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-block size-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      <span>Loading from gateway…</span>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="space-y-4 p-4">
                        {filteredSections.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                            <activeOperation.icon className={cn("h-8 w-8 opacity-30", activeOperation.iconColor)} />
                            <span>No examples available</span>
                          </div>
                        ) : (
                          filteredSections.map((section) => (
                            <section
                              key={section.title}
                              className={cn(
                                "rounded-xl border border-border/40 bg-background pl-3",
                                activeOperation.sectionBorder,
                              )}
                            >
                              {/* Section header */}
                              <div className="flex items-center justify-between gap-2 px-1 py-3 pr-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "rounded-md px-2 py-0.5 text-xs font-semibold",
                                      activeOperation.badgeBg,
                                    )}
                                  >
                                    {section.title}
                                  </span>
                                  {section.description ? (
                                    <p className="text-xs text-muted-foreground">
                                      {section.description}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      handleTryInPlayground(section.code)
                                    }
                                  >
                                    <Play className="h-3 w-3" />
                                    Playground
                                  </Button>
                                  <CopyToClipboardButton
                                    textToCopy={section.code}
                                  >
                                    {" "}
                                  </CopyToClipboardButton>
                                </div>
                              </div>

                              {/* Code block */}
                              <div className="block dark:hidden">
                                <SyntaxHighlighter
                                  language="graphql"
                                  style={prism}
                                  customStyle={{
                                    margin: 0,
                                    background: "#f8f8f8",
                                    padding: "16px",
                                    fontSize: "0.78rem",
                                    lineHeight: 1.6,
                                    borderRadius: "0 0 0.75rem 0.75rem",
                                  }}
                                  wrapLongLines
                                >
                                  {section.code}
                                </SyntaxHighlighter>
                              </div>
                              <div className="hidden dark:block">
                                <SyntaxHighlighter
                                  language="graphql"
                                  style={atomDark}
                                  customStyle={{
                                    margin: 0,
                                    background: "#1a1a2e",
                                    padding: "16px",
                                    fontSize: "0.78rem",
                                    lineHeight: 1.6,
                                    borderRadius: "0 0 0.75rem 0.75rem",
                                  }}
                                  wrapLongLines
                                >
                                  {section.code}
                                </SyntaxHighlighter>
                              </div>
                            </section>
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
