/** Copyable forms of a REST request card: plain HTTP, curl and fetch. None carries a session cookie or token. */

import { joinRequestLine } from "./request-line";
import type { RestRequestTemplate } from "./request-templates";

const hasBody = (t: RestRequestTemplate) => t.body !== undefined;

/** Single-quote an argument for a POSIX shell: `'` becomes `'\''`. */
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const absoluteUrl = (t: RestRequestTemplate, baseUrl: string) =>
  baseUrl.replace(/\/$/, "") + joinRequestLine(t.path, t.query);

export function toHttp(t: RestRequestTemplate): string {
  const line = `${t.method} ${joinRequestLine(t.path, t.query)}`;
  return hasBody(t) ? `${line}\n\n${JSON.stringify(t.body, null, 2)}` : line;
}

export function toCurl(t: RestRequestTemplate, baseUrl: string, blocksKey: string): string {
  const parts = [
    `curl -X ${t.method} ${shellQuote(absoluteUrl(t, baseUrl))}`,
    `-H ${shellQuote(`x-blocks-key: ${blocksKey}`)}`,
  ];
  if (hasBody(t)) {
    parts.push(`-H ${shellQuote("Content-Type: application/json")}`, `--data ${shellQuote(JSON.stringify(t.body))}`);
  }
  return parts.join(" \\\n  ");
}

export function toFetch(t: RestRequestTemplate, baseUrl: string, blocksKey: string): string {
  const lines = [
    `await fetch(${JSON.stringify(absoluteUrl(t, baseUrl))}, {`,
    `  method: ${JSON.stringify(t.method)},`,
    "  headers: {",
    `    "x-blocks-key": ${JSON.stringify(blocksKey)},`,
  ];
  if (hasBody(t)) {
    lines.push(`    "Content-Type": "application/json",`);
  }
  lines.push("  },");
  if (hasBody(t)) {
    const body = JSON.stringify(t.body, null, 2).replace(/\n/g, "\n  ");
    lines.push(`  body: JSON.stringify(${body}),`);
  }
  lines.push("});");
  return lines.join("\n");
}
