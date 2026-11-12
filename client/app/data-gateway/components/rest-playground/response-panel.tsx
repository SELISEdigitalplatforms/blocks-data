"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Loader } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { prettyPrintJsonLossless } from "../../rest/lossless-json";
import { isProblemMediaType, readProblem, type ProblemSummary } from "../../rest/problem-details";
import type { RestResponse } from "../../rest/rest-client";
import { PlaygroundMonacoEditor, usePlaygroundMonacoTheme } from "../playground/monaco-editor";

type ResponsePanelProps = {
  response: RestResponse | null;
  isSending: boolean;
};

const REASON_PHRASES: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const PILL_BASE = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium";

const statusPillClass = (status: number) => {
  if (status >= 200 && status < 300)
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300";
  if (status >= 300 && status < 400)
    return "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:text-amber-300";
  if (status >= 400)
    return "border-red-400/30 bg-red-500/10 text-red-700 dark:border-red-500/20 dark:text-red-300";
  return "border-border bg-muted text-muted-foreground";
};

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: "on",
  folding: true,
} as const;

type FormattedBody = { text: string; language: "json" | "plaintext"; isEmpty: boolean };

/** Numbers are shown exactly as sent (lossless); a body with a duplicate key is shown raw, as json. */
const formatBody = (bodyText: string): FormattedBody => {
  if (bodyText.length === 0) return { text: "", language: "plaintext", isEmpty: true };
  const pretty = prettyPrintJsonLossless(bodyText);
  return pretty === null
    ? { text: bodyText, language: "plaintext", isEmpty: false }
    : { text: pretty, language: "json", isEmpty: false };
};

/** `code · title` (empty parts skipped), then `detail`, then one line per error. */
const problemLines = (problem: ProblemSummary): string[] => {
  const lines: string[] = [];
  const first = [problem.code, problem.title].filter((part) => part).join(" · ");
  if (first) lines.push(first);
  if (problem.detail) lines.push(problem.detail);
  for (const error of problem.errors) {
    lines.push(`${error.field ? `${error.field}: ` : ""}${error.message}${error.type ? ` (${error.type})` : ""}`);
  }
  return lines;
};

const HEADER_BAR = "flex h-10 shrink-0 items-center gap-3 border-b border-border/40 bg-muted/10 px-4";

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function ResponsePanel({ response, isSending }: ResponsePanelProps) {
  const { t } = useT("data.gateway.schema");
  const theme = usePlaygroundMonacoTheme();

  const bodyText = response?.kind === "response" ? response.bodyText : "";
  const contentType = response?.kind === "response" ? response.contentType : "";
  const formatted = useMemo(() => formatBody(bodyText), [bodyText]);
  const status = response?.kind === "response" ? response.status : 0;
  // Parsing a large 2xx body a second time is wasted work: only errors and problem+json can carry a summary.
  const problem = useMemo(
    () => (status >= 400 || isProblemMediaType(contentType) ? readProblem(contentType, bodyText) : null),
    [status, contentType, bodyText],
  );

  const header = (content: ReactNode) => <div className={HEADER_BAR}>{content}</div>;
  const label = (
    <span className="text-xs font-medium text-muted-foreground">{t("REST_RESPONSE.RESPONSE")}</span>
  );

  if (isSending) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header(label)}
        <CenteredMessage>
          <Loader className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span role="status">{t("REST_RESPONSE.SENDING")}</span>
        </CenteredMessage>
      </div>
    );
  }

  if (response === null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header(label)}
        <CenteredMessage>{t("REST_RESPONSE.EMPTY")}</CenteredMessage>
      </div>
    );
  }

  if (response.kind === "aborted") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header(label)}
        <CenteredMessage>{t("REST_RESPONSE.ABORTED")}</CenteredMessage>
      </div>
    );
  }

  if (response.kind === "no-response") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header(
          <span className={cn(PILL_BASE, "border-border bg-muted text-muted-foreground")}>
            {t("REST_RESPONSE.NO_RESPONSE")}
          </span>,
        )}
        <CenteredMessage>
          <p className="font-medium text-foreground">{t("REST_RESPONSE.NO_RESPONSE_TITLE")}</p>
          <p>{response.reason}</p>
        </CenteredMessage>
      </div>
    );
  }

  const phrase = response.statusText || REASON_PHRASES[response.status] || "";
  const size =
    response.sizeBytes < 1024
      ? t("REST_RESPONSE.SIZE_BYTES", { value: response.sizeBytes })
      : t("REST_RESPONSE.SIZE_KB", { value: (response.sizeBytes / 1024).toFixed(1) });
  const lines = problem ? problemLines(problem) : [];

  return (
    <Tabs defaultValue="body" className="flex h-full min-h-0 flex-col">
      <div className={HEADER_BAR}>
        <span className={cn(PILL_BASE, statusPillClass(response.status))}>
          {phrase ? `${response.status} ${phrase}` : response.status}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("REST_RESPONSE.DURATION_AND_SIZE", { duration: response.durationMs, size })}
        </span>
        <TabsList className="ml-auto h-7 gap-0.5 bg-transparent p-0">
          {(["body", "headers"] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="h-7 rounded-sm px-3 text-xs text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {t(tab === "body" ? "REST_RESPONSE.BODY" : "REST_RESPONSE.HEADERS")}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="body" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        {lines.length > 0 && (
          <div role="region" aria-label={t("REST_RESPONSE.PROBLEM_SUMMARY")} className="shrink-0 space-y-0.5 border-b border-border/40 bg-muted/10 px-4 py-2 text-xs">
            {lines.map((line, index) => (
              <p key={index} className={index === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                {line}
              </p>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <PlaygroundMonacoEditor
            height="100%"
            language={formatted.language}
            theme={theme}
            value={formatted.isEmpty ? t("REST_RESPONSE.EMPTY_BODY") : formatted.text}
            options={EDITOR_OPTIONS}
          />
        </div>
      </TabsContent>
      <TabsContent value="headers" className="mt-0 min-h-0 flex-1 overflow-auto px-4 py-2">
        {response.headers.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("REST_RESPONSE.NO_HEADERS")}</p>
        ) : (
          <dl className="space-y-1 font-mono text-xs">
            {response.headers.map(([name, value], index) => (
              <div key={`${name}-${index}`} className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-foreground">{name}:</dt>
                <dd className="break-all text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </TabsContent>
    </Tabs>
  );
}
