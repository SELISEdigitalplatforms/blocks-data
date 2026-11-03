"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ISchemaDetails } from "../../models/data-service";
import {
  buildRestRequest,
  ITEM_ID_ERROR_KEY,
  pathRefusalKey,
  sendsBody,
  type RestDraft,
} from "../../rest/build-rest-request";
import { buildEntityShape } from "../../rest/entity-shape";
import { isMockTaggedRoute } from "../../rest/mock-data-tag";
import { hasItemIdPlaceholder } from "../../rest/path-guard";
import { joinRequestLine, splitRequestLine } from "../../rest/request-line";
import {
  buildBodyJsonSchema,
  type RestMethod,
  type RestRequestTemplate,
} from "../../rest/request-templates";
import { gatewayBaseUrl, type RestRequest } from "../../rest/rest-client";
import { routeIdFor } from "../../rest/route-id";
import { BodyEditor } from "./body-editor";
import { ConfirmBulkDialog, needsConfirm, type ConfirmKind } from "./confirm-bulk-dialog";
import { ParamsEditor, suggestedParamKeys } from "./params-editor";
import { RequestBar, selectItemIdPlaceholder } from "./request-bar";
import { ResponsePanel } from "./response-panel";
import { useRestSchemas } from "./use-rest-schemas";
import { useRestSender } from "./use-rest-sender";

export { needsConfirm, type ConfirmKind, type RestDraft };

export const loadTemplate = (template: RestRequestTemplate): RestDraft => ({
  method: template.method,
  requestLine: joinRequestLine(template.path, template.query),
  bodyText: template.body === undefined ? "" : JSON.stringify(template.body, null, 2),
});

export const requestToDraft = (req: RestRequest): RestDraft => ({
  method: req.method,
  requestLine: joinRequestLine(req.path, req.query),
  bodyText: req.body ?? "",
});

type RestWorkspaceProps = {
  /** A draft handed in by the Requests drawer or a handoff; a new `nonce` replaces the current draft. */
  incoming?: { draft: RestDraft; nonce: number };
};

type Tab = "params" | "body" | "headers";

const EMPTY_DRAFT: RestDraft = { method: "GET", requestLine: "", bodyText: "" };
const TABS: { value: Tab; label: string }[] = [
  { value: "params", label: "REST_PLAYGROUND.TAB_PARAMS" },
  { value: "body", label: "REST_PLAYGROUND.TAB_BODY" },
  { value: "headers", label: "REST_PLAYGROUND.TAB_HEADERS" },
];
const TAB_TRIGGER =
  "h-7 rounded-sm px-3 text-xs text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none";

const tabFor = (method: RestMethod): Tab => (method === "GET" ? "params" : "body");

const findSchema = (schemas: ISchemaDetails[], name: string) =>
  schemas.find((s) => s.schemaName === name) ??
  schemas.find((s) => s.schemaName?.toLowerCase() === name.toLowerCase());

export function RestWorkspace({ incoming }: RestWorkspaceProps) {
  const { t } = useT("data.gateway.schema");
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { entities, allSchemas, entityNames } = useRestSchemas(projectKey);

  const [draft, setDraft] = useState<RestDraft>(incoming?.draft ?? EMPTY_DRAFT);
  const [tab, setTab] = useState<Tab>(tabFor(incoming?.draft.method ?? "GET"));
  const [pathError, setPathError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ req: RestRequest; kind: ConfirmKind } | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const { response, isSending, send: sendRequest, cancel, abandon } = useRestSender();

  // A new nonce replaces the draft (adjusting state while rendering, so no stale frame is shown).
  const [loadedNonce, setLoadedNonce] = useState(incoming?.nonce);
  if (incoming && incoming.nonce !== loadedNonce) {
    setLoadedNonce(incoming.nonce);
    setDraft(incoming.draft);
    setTab(tabFor(incoming.draft.method));
    setPathError(null);
    setBodyError(null);
  }

  // A new hand-over quietly drops the request still out: its result belonged to the replaced draft. A loaded draft
  // whose path holds {itemId} gets the placeholder selected, ready to type over. A layout effect, so no late result can
  // land between the commit and the passive effects.
  useLayoutEffect(() => {
    abandon();
    if (incoming && hasItemIdPlaceholder(splitRequestLine(incoming.draft.requestLine).path)) {
      selectItemIdPlaceholder(pathInputRef.current);
    }
    // Only a new hand-over moves the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.nonce]);

  const { path } = splitRequestLine(draft.requestLine);
  const hasBody = draft.method !== "GET";
  const willSendBody = sendsBody(draft);
  const isMockTagged = isMockTaggedRoute(draft.method, path);
  const route = routeIdFor(draft.method, path);
  const routeEntity = route?.entity;
  const routeId = route?.id;

  const bodySchema = useMemo(() => {
    if (!routeEntity || !routeId) return null;
    const schema = findSchema(entities, routeEntity);
    return schema ? buildBodyJsonSchema(buildEntityShape(schema, allSchemas), routeId) : null;
  }, [routeEntity, routeId, entities, allSchemas]);

  const dispatch = (req: RestRequest) =>
    void sendRequest(req, (refusal) => setPathError(t(pathRefusalKey(refusal))));

  const send = () => {
    const built = buildRestRequest(draft, gatewayBaseUrl());
    if (!built.ok) {
      const message = t(built.key, built.params);
      if (built.target === "path") {
        setPathError(message);
        if (built.key === ITEM_ID_ERROR_KEY) selectItemIdPlaceholder(pathInputRef.current);
      } else {
        setBodyError(message);
        setTab("body");
      }
      return;
    }
    const kind = needsConfirm(built.req);
    if (kind) setPending({ req: built.req, kind });
    else dispatch(built.req);
  };

  const changeRequestLine = (requestLine: string) => {
    setDraft((current) => ({ ...current, requestLine }));
    setPathError(null);
  };

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row md:gap-0">
        <div className="flex min-h-[320px] w-full flex-col border-b border-border/40 md:min-h-0 md:w-1/2 md:border-b-0 md:border-r">
          <RequestBar
            method={draft.method}
            onMethodChange={(method) => setDraft((current) => ({ ...current, method }))}
            requestLine={draft.requestLine}
            onRequestLineChange={changeRequestLine}
            entityNames={entityNames}
            pathError={pathError}
            isSending={isSending}
            onSend={send}
            onCancel={cancel}
            inputRef={pathInputRef}
          />
          <Tabs
            value={!hasBody && tab === "body" ? "params" : tab}
            onValueChange={(value) => setTab(value as Tab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex h-10 shrink-0 items-center border-b border-border/40 bg-muted/10 px-4">
              <TabsList className="h-7 gap-0.5 bg-transparent p-0">
                {TABS.filter(({ value }) => hasBody || value !== "body").map(({ value, label }) => (
                  <TabsTrigger key={value} value={value} className={TAB_TRIGGER}>
                    {t(label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="params" className="mt-0 min-h-0 flex-1 overflow-auto">
              <ParamsEditor
                requestLine={draft.requestLine}
                onRequestLineChange={changeRequestLine}
                suggestedKeys={suggestedParamKeys(routeId)}
              />
            </TabsContent>
            {hasBody && (
              // Kept mounted while hidden so the editor keeps its undo history and cursor.
              <TabsContent
                value="body"
                forceMount
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <BodyEditor
                  value={draft.bodyText}
                  onChange={(bodyText) => {
                    setDraft((current) => ({ ...current, bodyText }));
                    setBodyError(null);
                  }}
                  schema={bodySchema}
                  error={bodyError}
                  onSend={send}
                />
              </TabsContent>
            )}
            <TabsContent value="headers" className="mt-0 min-h-0 flex-1 overflow-auto px-4 py-3">
              <dl className="space-y-1 font-mono text-xs">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">x-blocks-key:</dt>
                  <dd className="text-muted-foreground">{t("REST_PLAYGROUND.HEADERS_CONSOLE_KEY")}</dd>
                </div>
                {willSendBody && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-foreground">Content-Type:</dt>
                    <dd className="text-muted-foreground">application/json</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">{t("REST_PLAYGROUND.HEADERS_NOTE")}</p>
            </TabsContent>
          </Tabs>
          {isMockTagged && (
            <p className="shrink-0 border-t border-border/40 bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
              {t("REST_PLAYGROUND.MOCK_DATA_NOTE")}
            </p>
          )}
        </div>
        <div className="flex min-h-[280px] w-full flex-col border-t border-border/40 md:min-h-0 md:w-1/2 md:border-t-0">
          <ResponsePanel response={response} isSending={isSending} />
        </div>
      </div>
      <ConfirmBulkDialog
        kind={pending?.kind ?? null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) dispatch(pending.req);
          setPending(null);
        }}
      />
    </>
  );
}
