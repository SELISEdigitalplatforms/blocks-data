"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
import { Button } from "@/components/ui-kits/button/button";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { useDataGatewayPath } from "@/hooks/use-scoped-path";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Play } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import { buildPreviewSections } from "../../utils/generate-preview-queries";
import { writePlaygroundHandoff } from "../../utils/playground-handoff";
import { operationFor, type OperationGroup } from "./operations";
import { PreviewEmptyState } from "./preview-empty-state";

type GraphQLPreviewPanelProps = {
  rawIntrospection?: unknown;
  schemaName?: string;
  operationGroup: OperationGroup;
  /** The gateway schema is still loading: a spinner replaces the cards. */
  isLoading: boolean;
};

/** The GraphQL side of "Request format": one card per query or mutation in the selected group. */
export function GraphQLPreviewPanel({
  rawIntrospection,
  schemaName,
  operationGroup,
  isLoading,
}: GraphQLPreviewPanelProps) {
  const { t } = useT("data.gateway.schema");
  const navigate = useNavigate();
  const dataGatewayPath = useDataGatewayPath();

  const handleTryInPlayground = (code: string) => {
    writePlaygroundHandoff({ protocol: "graphql", query: code });
    navigate(`${dataGatewayPath}/playground`);
  };

  const sections = useMemo(
    () =>
      rawIntrospection && schemaName ? buildPreviewSections(rawIntrospection, schemaName) : [],
    [schemaName, rawIntrospection],
  );

  const filteredSections = useMemo(() => {
    const operationTabMap: Record<OperationGroup, string[]> = {
      // These must read the same text as the section titles built in generate-preview-queries.
      query: [t("GENERATE_PREVIEW_QUERIES.QUERY")],
      insert: [t("GENERATE_PREVIEW_QUERIES.INSERT"), t("GENERATE_PREVIEW_QUERIES.INSERT_MANY")],
      update: [t("common:UPDATE"), t("GENERATE_PREVIEW_QUERIES.UPDATE_MANY")],
      delete: [t("common:DELETE"), t("GENERATE_PREVIEW_QUERIES.DELETE_MANY")],
    };
    const allowedTitles = operationTabMap[operationGroup];
    return sections.filter((s) => allowedTitles.includes(s.title));
  }, [sections, operationGroup, t]);

  const activeOperation = operationFor(operationGroup);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-foreground/80">
        <span className="inline-block size-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
        <span className="text-xs">{t("SCHEMA_PREVIEW_DRAWER.LOADING_FROM_GATEWAY")}</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {filteredSections.length === 0 ? (
          <PreviewEmptyState operationGroup={operationGroup} />
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
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                      activeOperation.badgeBg,
                    )}
                  >
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
                    {t("SCHEMA_PREVIEW_DRAWER.PLAYGROUND")}
                  </Button>
                  <CopyToClipboardButton textToCopy={section.code}> </CopyToClipboardButton>
                </div>
              </div>

              {/* Code block */}
              <div className="block bg-gray-50 dark:hidden">
                <SyntaxHighlighter
                  language="graphql"
                  style={prism}
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    padding: "14px 16px",
                    fontSize: "0.775rem",
                    lineHeight: 1.6,
                  }}
                  wrapLongLines
                >
                  {section.code}
                </SyntaxHighlighter>
              </div>
              <div className="hidden bg-[#0f0f19] dark:block">
                <SyntaxHighlighter
                  language="graphql"
                  style={atomDark}
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    padding: "14px 16px",
                    fontSize: "0.775rem",
                    lineHeight: 1.6,
                  }}
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
  );
}
