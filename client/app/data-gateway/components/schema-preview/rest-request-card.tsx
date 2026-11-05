"use client";

import { writeToClipboard } from "@/components/copy-to-clipboard-button";
import { Button } from "@/components/ui-kits/button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { useDataGatewayPath } from "@/hooks/use-scoped-path";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Check, ChevronDown, Copy, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";
import prism from "react-syntax-highlighter/dist/esm/styles/prism/prism";
import {
  templateDescriptionKey,
  templateTitleKey,
  type RestRequestTemplate,
} from "../../rest/request-templates";
import { toCurl, toFetch, toHttp } from "../../rest/snippets";
import { writePlaygroundHandoff } from "../../utils/playground-handoff";
import { METHOD_BADGE } from "../rest-playground/method-badge";
import { entityRelativePath } from "./entity-relative-path";

type RestRequestCardProps = {
  template: RestRequestTemplate;
  /** The header shows the path relative to this entity, since the Base URL row already ends in it. */
  entityName: string;
  /** The public gateway base, without a trailing slash. */
  baseUrl: string;
  blocksKey: string;
  /** The operation group's left border, as on the GraphQL cards. */
  accentClassName?: string;
};

const COPIED_FEEDBACK_MS = 1000;

const CODE_STYLE = {
  margin: 0,
  background: "transparent",
  padding: "14px 16px",
  fontSize: "0.775rem",
  lineHeight: 1.6,
};

/** One REST request: method, entity-relative path, title and description, Playground, a Copy menu, and the request as plain HTTP. */
export function RestRequestCard({
  template,
  entityName,
  baseUrl,
  blocksKey,
  accentClassName,
}: RestRequestCardProps) {
  const { t } = useT("data.gateway.schema");
  const navigate = useNavigate();
  const dataGatewayPath = useDataGatewayPath();
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const http = toHttp(template);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (text: string) => {
    try {
      await writeToClipboard(text);
      setCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const openInPlayground = () => {
    writePlaygroundHandoff({
      protocol: "rest",
      method: template.method,
      path: template.path,
      query: template.query,
      body: template.body === undefined ? undefined : JSON.stringify(template.body, null, 2),
    });
    navigate(`${dataGatewayPath}/playground`);
  };

  return (
    <article
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-sm border border-border/60 bg-card", accentClassName)}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              data-testid="request-method"
              className={cn(
                "w-14 shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold",
                METHOD_BADGE[template.method],
              )}
            >
              {template.method}
            </span>
            <code data-testid="request-path" className="truncate font-mono text-xs font-medium text-foreground">
              {entityRelativePath(template.path, entityName)}
            </code>
          </div>
          <p id={titleId} className="text-xs font-medium text-foreground">
            {t(templateTitleKey(template.id))}
          </p>
          <p className="text-xs text-foreground/70">{t(templateDescriptionKey(template.id))}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs text-foreground/80 hover:text-foreground"
            onClick={openInPlayground}
          >
            <Play className="h-3 w-3" />
            {t("SCHEMA_PREVIEW_DRAWER.PLAYGROUND")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs text-foreground/80 hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                {copied ? t("REST_PREVIEW.COPIED") : t("REST_PREVIEW.COPY")}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem className="cursor-pointer text-xs" onSelect={() => copy(http)}>
                {t("REST_PREVIEW.COPY_HTTP")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onSelect={() => copy(toCurl(template, baseUrl, blocksKey))}
              >
                {t("REST_PREVIEW.COPY_CURL")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onSelect={() => copy(toFetch(template, baseUrl, blocksKey))}
              >
                {t("REST_PREVIEW.COPY_FETCH")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="block bg-gray-50 dark:hidden">
        <SyntaxHighlighter language="http" style={prism} customStyle={CODE_STYLE} wrapLongLines>
          {http}
        </SyntaxHighlighter>
      </div>
      <div className="hidden bg-[#0f0f19] dark:block">
        <SyntaxHighlighter language="http" style={atomDark} customStyle={CODE_STYLE} wrapLongLines>
          {http}
        </SyntaxHighlighter>
      </div>
    </article>
  );
}
