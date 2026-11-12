import { scanJson } from "./json-error-line";

/**
 * JSON that keeps every number exactly as written. `JSON.parse` turns numbers into doubles, so a round trip rounds
 * integers above 2^53, turns `1.0` into `1`, `-0` into `0` and `1e400` into `null`. Here each number token is first
 * swapped for a unique sentinel string, the text is parsed and transformed, and the sentinels in the output are
 * swapped back for the original number text. Pure; no dependency.
 */

/** Why a text was not transformed. */
export type LosslessRefusal =
  | { ok: false; reason: "invalid-json" }
  /** Parsing would drop all but the last member with this (decoded) key, and the numbers it holds. */
  | { ok: false; reason: "duplicate-key"; key: string }
  /** Nested deeper than the recursive scanner can follow. */
  | { ok: false; reason: "too-deep" }
  /** Every nonce drawn appeared in a string or key of the text itself. */
  | { ok: false; reason: "nonce-collision" };

export type LosslessResult = { ok: true; text: string } | LosslessRefusal;

type Scan = { numbers: [start: number, end: number][]; duplicateKey: string | null };

const SENTINEL_PREFIX = "__lossless_json_";
const MAX_NONCE_ATTEMPTS = 5;

/** The decoded value of a raw string token; most keys have no escapes, so they skip the parse. */
const decodeKey = (raw: string): string => (raw.includes("\\") ? (JSON.parse(raw) as string) : raw.slice(1, -1));

/** The number tokens and the first duplicate key of `text`; null when it is not JSON. May throw a RangeError. */
function scan(text: string): Scan | null {
  const numbers: Scan["numbers"] = [];
  let duplicateKey: string | null = null;
  const error = scanJson(text, {
    number: (start, end) => numbers.push([start, end]),
    object: (rawKeys) => {
      if (duplicateKey !== null || rawKeys.length < 2) return;
      const seen = new Set<string>();
      for (const raw of rawKeys) {
        const key = decodeKey(raw);
        if (seen.has(key)) {
          duplicateKey = key;
          return;
        }
        seen.add(key);
      }
    },
  });
  return error === null ? { numbers, duplicateKey } : null;
}

const newNonce = (): string =>
  Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36)).join("");

/** Whether any string (key or value) in `value` contains `nonce`. Iterative, so depth is limited only by the scanner. */
function holdsNonce(root: unknown, nonce: string): boolean {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (value.includes(nonce)) return true;
    } else if (Array.isArray(value)) {
      for (const item of value) pending.push(item);
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (key.includes(nonce)) return true;
        pending.push(item);
      }
    }
  }
  return false;
}

/** Only for a text with no duplicate key, so parsing keeps every member and so every sentinel. */
function transformScanned(
  text: string,
  { numbers }: Scan,
  transform: (value: unknown) => unknown,
  space?: number,
): LosslessResult {
  // The user's own strings and keys, decoded, so a nonce they hold is found however it was escaped.
  const asTyped: unknown = JSON.parse(text);
  for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt++) {
    const nonce = newNonce();
    // A string of the user's own that holds the nonce would be mistaken for a number; pick another nonce.
    if (holdsNonce(asTyped, nonce)) continue;

    const sentinel = (index: number) => `${SENTINEL_PREFIX}${nonce}_${index}`;
    let masked = "";
    let last = 0;
    numbers.forEach(([start, end], index) => {
      masked += `${text.slice(last, start)}"${sentinel(index)}"`;
      last = end;
    });
    masked += text.slice(last);

    const pattern = new RegExp(`"${SENTINEL_PREFIX}${nonce}_(\\d+)"`, "g");
    const out = JSON.stringify(transform(JSON.parse(masked)), null, space).replace(pattern, (_, index: string) => {
      const [start, end] = numbers[Number(index)];
      return text.slice(start, end);
    });
    return { ok: true, text: out };
  }
  return { ok: false, reason: "nonce-collision" };
}

/**
 * Parses `text`, runs `transform` on the value and stringifies the result, keeping every number token as written.
 * Refuses, and never runs `transform`, when `text` is not JSON, has a duplicate key in an object (parsing would drop
 * a member) or is nested too deeply; a RangeError from `transform` also counts as too deep.
 */
export function transformJsonLossless(
  text: string,
  transform: (value: unknown) => unknown,
  space?: number,
): LosslessResult {
  try {
    const scanned = scan(text);
    if (!scanned) return { ok: false, reason: "invalid-json" };
    if (scanned.duplicateKey !== null) return { ok: false, reason: "duplicate-key", key: scanned.duplicateKey };
    return transformScanned(text, scanned, transform, space);
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, reason: "too-deep" };
    throw error;
  }
}

/**
 * `text` pretty-printed with two spaces and its numbers exact; null when it is not JSON, is nested too deeply to
 * format, or can't be formatted losslessly, so the caller shows it raw. A text with a duplicate key in an object is
 * returned unchanged, since parsing would drop all but the last member.
 */
export function prettyPrintJsonLossless(text: string): string | null {
  try {
    const scanned = scan(text);
    if (!scanned) return null;
    if (scanned.duplicateKey !== null) return text;
    const result = transformScanned(text, scanned, (value) => value, 2);
    return result.ok ? result.text : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
