"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
import { Button } from "@/components/ui-kits/button/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
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
import { getGraphqlGatewayExecuteOrigin } from "@/constants/endpoint.constant";
import { useGetProject } from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import { useRawIntrospectionQuery } from "../hooks/use-configuration";
import { SchemaPreviewDrawerProps } from "../models/schema-preview.types";
import { buildPreviewSections } from "../utils/generate-preview-queries";
import { formatPreviewJson } from "../utils/graphql-template.utils";

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
  const requestUrl = `${getGraphqlGatewayExecuteOrigin()}/api/gateway`;
  const navigate = useNavigate();

  useEffect(() => {
    const newDefaultTab = isEntity ? "request-format" : "schema-structure";
    setActiveTab(newDefaultTab);
  }, [isEntity]);

  const handleTryInPlayground = (code: string) => {
    // Store the code in localStorage to be picked up by the playground
    localStorage.setItem("graphql-playground-query", code);
    // Navigate to the playground
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

  const headingSource =
    schemaName ??
    (typeof previewData.SchemaName === "string"
      ? previewData.SchemaName
      : undefined);
  const heading = title ?? `${headingSource ?? "Schema"} preview`;

  return (
    <Drawer
      direction="right"
      handleOnly
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l bg-background p-6 md:w-[70vw] md:max-w-4xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className,
        )}
        style={{ userSelect: "text" }}
      >
        <div className="flex h-full flex-1 flex-col">
          <div className="flex items-center justify-between gap-4">
            <DrawerTitle className="text-lg font-semibold leading-none tracking-tight">
              {heading}
            </DrawerTitle>
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

            {/* Schema Structure Tab - JSON Preview */}
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
                  {/* Light Mode */}
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
                  {/* Dark Mode */}
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

            {/* Request Format Tab - GraphQL Templates */}
            <TabsContent
              value="request-format"
              className="mt-4 flex-1 overflow-hidden"
            >
              <ScrollArea className="h-full pr-4">
                <div className="relative space-y-3 pb-4">
                  {isGatewaySchemaLoading ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 py-12 text-sm text-muted-foreground">
                      <span className="inline-block size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      Loading request examples from gateway…
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                        <span className="mb-1 sm:mb-0">Request URL:</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <CopyToClipboardButton
                            textToCopy={requestUrl}
                            isHoverable
                          >
                            <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                              {requestUrl}
                            </code>
                          </CopyToClipboardButton>
                        </div>
                      </div>
                      <div className="flex flex-col text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                        <span className="mb-1 sm:mb-0">
                          Add In Request Headers:
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <CopyToClipboardButton
                            textToCopy={`x-blocks-key: ${projectKey}`}
                            isHoverable
                          >
                            <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                              x-blocks-key: {projectKey}
                            </code>
                          </CopyToClipboardButton>
                        </div>
                      </div>

                      {sections.map((section) => (
                        <section
                          key={section.title}
                          className="rounded-2xl bg-background"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="w-full space-y-1">
                              <h4 className="text-base font-semibold text-foreground">
                                {section.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {section.description}
                              </p>
                            </div>
                          </div>

                          <div className="pb-3">
                            {/* Light Mode */}
                            <div className="group relative block rounded-xl bg-gray-100 pr-24 dark:hidden">
                              <div className="absolute right-6 top-2 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1"
                                  onClick={() =>
                                    handleTryInPlayground(section.code)
                                  }
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Try in Playground
                                </Button>
                                <CopyToClipboardButton
                                  textToCopy={section.code}
                                >
                                  {" "}
                                </CopyToClipboardButton>
                              </div>
                              <SyntaxHighlighter
                                language="graphql"
                                style={prism}
                                customStyle={{
                                  margin: 0,
                                  background: "transparent",
                                  padding: "20px",
                                  fontSize: "0.8rem",
                                  lineHeight: 1.5,
                                  borderRadius: "0.75rem",
                                }}
                                wrapLongLines
                              >
                                {section.code}
                              </SyntaxHighlighter>
                            </div>
                            {/* Dark Mode */}
                            <div className="group relative hidden rounded-xl bg-gray-800 pr-24 dark:block">
                              <div className="absolute right-6 top-2 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1"
                                  onClick={() =>
                                    handleTryInPlayground(section.code)
                                  }
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Try in Playground
                                </Button>
                                <CopyToClipboardButton
                                  textToCopy={section.code}
                                >
                                  {" "}
                                </CopyToClipboardButton>
                              </div>
                              <SyntaxHighlighter
                                language="graphql"
                                style={atomDark}
                                customStyle={{
                                  margin: 0,
                                  background: "transparent",
                                  padding: "20px",
                                  fontSize: "0.8rem",
                                  lineHeight: 1.5,
                                  borderRadius: "0.75rem",
                                }}
                                wrapLongLines
                              >
                                {section.code}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        </section>
                      ))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
