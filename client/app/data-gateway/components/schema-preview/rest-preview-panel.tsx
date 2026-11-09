"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Info } from "lucide-react";
import { useMemo } from "react";
import type { EntityShape } from "../../rest/entity-shape";
import { buildRestRequests } from "../../rest/request-templates";
import type { SchemaLiveState } from "../../utils/schema-live-state";
import { operationFor, type OperationGroup } from "./operations";
import { RestRequestCard } from "./rest-request-card";

type RestPreviewPanelProps = {
  shape: EntityShape;
  liveState: SchemaLiveState;
  /** `BLOCKS_GRAPHQL_PUBLIC_URL`; a trailing slash is ignored. */
  publicBaseUrl: string;
  /** The project's `x-blocks-key`. */
  blocksKey: string;
  operationGroup: OperationGroup;
};

const LIVE_STATE_NOTICE: Record<Exclude<SchemaLiveState, null>, string> = {
  "not-live": "REST_PREVIEW.NOT_LIVE_NOTICE",
  unpublished: "REST_PREVIEW.UNPUBLISHED_NOTICE",
};

function ConnectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-foreground">
        {label}
      </span>
      <CopyToClipboardButton textToCopy={value} isHoverable>
        <code className="break-all font-mono text-foreground">{value}</code>
      </CopyToClipboardButton>
    </div>
  );
}

/** The REST side of "Request format": the connection bar, the live-state notice and the group's request cards. */
export function RestPreviewPanel({
  shape,
  liveState,
  publicBaseUrl,
  blocksKey,
  operationGroup,
}: RestPreviewPanelProps) {
  const { t } = useT("data.gateway.schema");
  const baseUrl = publicBaseUrl.replace(/\/+$/, "");
  const templates = useMemo(() => buildRestRequests(shape), [shape]);
  const visible = templates.filter((template) => template.group === operationGroup);
  const accent = operationFor(operationGroup).sectionBorder;
  const headers = [`x-blocks-key: ${blocksKey}`, "Content-Type: application/json"];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-border/40 px-4 py-3">
        <ConnectionRow label={t("REST_PREVIEW.BASE_URL")} value={`${baseUrl}/${shape.name}`} />
        <div className="flex items-start gap-3 text-xs">
          <span className="w-16 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-widest text-foreground">
            {t("REST_PREVIEW.HEADERS")}
          </span>
          <div className="min-w-0 space-y-1">
            {headers.map((header) => (
              <CopyToClipboardButton key={header} textToCopy={header} isHoverable>
                <code className="break-all font-mono text-foreground">{header}</code>
              </CopyToClipboardButton>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {liveState && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-sm border border-warning-500/50 bg-warning-100 px-3 py-2 text-xs text-warning-800"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t(LIVE_STATE_NOTICE[liveState])}
            </p>
          )}
          {visible.map((template) => (
            <RestRequestCard
              key={template.id}
              template={template}
              entityName={shape.name}
              baseUrl={baseUrl}
              blocksKey={blocksKey}
              accentClassName={accent}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
