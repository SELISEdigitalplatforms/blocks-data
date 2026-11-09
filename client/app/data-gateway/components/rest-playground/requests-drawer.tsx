"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui-kits/drawer/drawer";
import { Input } from "@/components/ui-kits/input/input";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Boxes, ChevronDown, ChevronRight, Loader, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { usePendingSchemaIds } from "../../hooks/use-configuration";
import type { ISchemaDetails } from "../../models/data-service";
import { buildEntityShape } from "../../rest/entity-shape";
import { buildRestRequests, templateTitleKey } from "../../rest/request-templates";
import { SCHEMA_LIVE_STATE_LABELS, schemaLiveState } from "../../utils/schema-live-state";
import { METHOD_BADGE } from "./method-badge";
import { loadTemplate, type RestDraft } from "./rest-workspace";
import { useRestSchemas } from "./use-rest-schemas";

type RequestsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseRequest: (draft: RestDraft) => void;
};

type EntityOperationsProps = {
  schema: ISchemaDetails;
  allSchemas: ISchemaDetails[];
  onUse: (draft: RestDraft) => void;
};

/** Mounted only while its entity is expanded, so the shape and templates are built on demand. */
function EntityOperations({ schema, allSchemas, onUse }: EntityOperationsProps) {
  const { t } = useT("data.gateway.schema");
  const templates = useMemo(
    () => buildRestRequests(buildEntityShape(schema, allSchemas)),
    [schema, allSchemas],
  );

  return (
    <ul className="mt-1 space-y-1 border-l border-border/40 pl-3">
      {templates.map((template) => (
        <li
          key={template.id}
          className="flex items-center gap-2 rounded-sm border border-border/40 bg-card px-3 py-2"
        >
          <span
            data-testid="request-method"
            className={cn(
              "w-14 shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold",
              METHOD_BADGE[template.method],
            )}
          >
            {template.method}
          </span>
          <div className="min-w-0 flex-1">
            <code className="block truncate text-xs font-medium">{template.path}</code>
            <span className="block truncate text-xs text-muted-foreground">
              {t(templateTitleKey(template.id))}
            </span>
          </div>
          <button
            type="button"
            aria-label={t("REST_REQUESTS_DRAWER.USE_REQUEST_IN_BUILDER", {
              method: template.method,
              path: template.path,
            })}
            onClick={() => onUse(loadTemplate(template))}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {t("REST_REQUESTS_DRAWER.USE_IN_BUILDER")}
          </button>
        </li>
      ))}
    </ul>
  );
}

type EntityRowProps = EntityOperationsProps & { expanded: boolean; onToggle: () => void; liveLabel?: string };

function EntityRow({ schema, allSchemas, onUse, expanded, onToggle, liveLabel }: EntityRowProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  // Joined explicitly, as in the schema rail, so the name never depends on how text nodes concatenate.
  const label = liveLabel ? `${schema.schemaName} · ${liveLabel}` : schema.schemaName;
  return (
    <div className="mx-4 mb-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={label}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted/20"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate text-sm font-medium">{schema.schemaName}</code>
        {liveLabel && (
          <span className="shrink-0 rounded-full border border-warning-500/50 bg-warning-100 px-1.5 text-[10.5px] font-medium leading-4 text-warning-800">
            {liveLabel}
          </span>
        )}
      </button>
      {expanded && <EntityOperations schema={schema} allSchemas={allSchemas} onUse={onUse} />}
    </div>
  );
}

export function RequestsDrawer({ open, onOpenChange, onUseRequest }: RequestsDrawerProps) {
  const { t } = useT("data.gateway.schema");
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { entities, allSchemas, isPending, isError, refetch } = useRestSchemas(projectKey);
  const pendingSchemaIds = usePendingSchemaIds(projectKey);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // A failed background refetch keeps the list already loaded; the error state is for when there is nothing to show.
  const showError = isError && entities.length === 0;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? entities.filter((s) => s.schemaName?.toLowerCase().includes(needle))
      : entities;
  }, [entities, search]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const use = (draft: RestDraft) => {
    onUseRequest(draft);
    onOpenChange(false);
  };

  return (
    <Drawer
      direction="right"
      handleOnly
      modal={false}
      shouldScaleBackground={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        onInteractOutside={() => onOpenChange(false)}
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l border-border/40 bg-background md:w-[50vw] md:max-w-2xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        )}
        style={{ userSelect: "text" }}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.05),transparent_55%)]" />

          <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
            <DrawerTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-indigo-400" />
              {t("REST_REQUESTS_DRAWER.TITLE")}
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                aria-label={t("REST_REQUESTS_DRAWER.CLOSE")}
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          <div className="relative shrink-0 border-b border-border/40 px-5 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("REST_REQUESTS_DRAWER.SEARCH")}
                aria-label={t("REST_REQUESTS_DRAWER.SEARCH")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 border-border/40 bg-muted/10 pl-9 text-xs placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <ScrollArea className="relative flex-1">
            {isPending && (
              <div
                role="status"
                aria-label={t("REST_REQUESTS_DRAWER.LOADING")}
                className="flex flex-col items-center justify-center gap-2 py-16 text-xs text-muted-foreground"
              >
                <Loader className="h-5 w-5 animate-spin" />
                {t("REST_REQUESTS_DRAWER.LOADING")}
              </div>
            )}
            {!isPending && showError && (
              <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center text-xs text-muted-foreground">
                {t("REST_REQUESTS_DRAWER.ERROR")}
                <Button type="button" size="sm" variant="outline" onClick={() => refetch()} className="h-7 px-3 text-xs">
                  {t("REST_REQUESTS_DRAWER.RETRY")}
                </Button>
              </div>
            )}
            {!isPending && !showError && visible.length === 0 && (
              <div className="py-16 text-center text-xs text-muted-foreground">
                {entities.length === 0
                  ? t("REST_REQUESTS_DRAWER.EMPTY")
                  : t("REST_REQUESTS_DRAWER.NO_MATCHES")}
              </div>
            )}
            {!isPending && !showError && visible.length > 0 && (
              <div className="py-2">
                {visible.map((schema) => {
                  const liveState = schemaLiveState(schema, pendingSchemaIds);
                  return (
                    <EntityRow
                      key={schema.id}
                      schema={schema}
                      allSchemas={allSchemas}
                      onUse={use}
                      expanded={expanded.has(schema.id)}
                      onToggle={() => toggle(schema.id)}
                      liveLabel={liveState ? SCHEMA_LIVE_STATE_LABELS[liveState] : undefined}
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
