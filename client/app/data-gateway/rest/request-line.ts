/** The request line of the REST playground: a path and its query pairs, as one editable string. */

export function splitRequestLine(text: string): { path: string; query: [string, string][] } {
  const at = text.indexOf("?");
  if (at === -1) return { path: text, query: [] };
  return { path: text.slice(0, at), query: [...new URLSearchParams(text.slice(at + 1))] };
}

/** encodeURIComponent throws on these; URLSearchParams used to replace them with U+FFFD, and so does this. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** `:` and `,` are legal in a query string and common in values (`Name:ASC`, `A,B`), so they stay readable. */
const encodeQueryPart = (part: string): string =>
  encodeURIComponent(part.replace(LONE_SURROGATE, "\uFFFD")).replace(/%3A/g, ":").replace(/%2C/g, ",");

/** Pairs with an empty key are dropped. A space is written as %20, not +. */
export function joinRequestLine(path: string, query: [string, string][]): string {
  const search = query
    .filter(([key]) => key !== "")
    .map(([key, value]) => `${encodeQueryPart(key)}=${encodeQueryPart(value)}`)
    .join("&");
  return search ? `${path}?${search}` : path;
}
