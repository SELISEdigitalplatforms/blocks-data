/**
 * The 1-based line of the first syntax error in `text`, or null when it is valid JSON. Browsers word JSON.parse
 * errors differently and some give no position, so the location comes from this strict scanner (RFC 8259).
 */
export function jsonErrorLine(text: string): number | null {
  try {
    JSON.parse(text);
    return null;
  } catch {
    return text.slice(0, errorOffset(text)).split("\n").length;
  }
}

/** Where the scanner finds the error; the end of the text when it finds none or the text is nested too deeply. */
function errorOffset(text: string): number {
  try {
    return scanJson(text) ?? text.length;
  } catch (error) {
    if (error instanceof RangeError) return text.length;
    throw error;
  }
}

class ScanError {
  constructor(readonly offset: number) {}
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const HEX4 = /[0-9a-fA-F]{4}/y;

/** What `scanJson` reports as it reads valid tokens; it is called before the scan knows the whole text is valid. */
export type JsonScanVisitor = {
  /** A number token at `text.slice(start, end)`, outside any string. */
  number?: (start: number, end: number) => void;
  /** An object's member keys, as raw string tokens (quotes and escapes included), when the object closes. */
  object?: (keys: string[]) => void;
};

/** Strictly scans `text` as one JSON value; returns the offset of the first syntax error, or null when it is valid. */
export function scanJson(text: string, visitor: JsonScanVisitor = {}): number | null {
  let at = 0;
  const fail = (): never => {
    throw new ScanError(at);
  };
  const skipWhitespace = () => {
    while (at < text.length && WHITESPACE.has(text[at])) at++;
  };
  const expect = (char: string) => {
    if (text[at] !== char) fail();
    at++;
  };

  const scanString = () => {
    expect('"');
    while (at < text.length && text[at] !== '"') {
      const code = text.charCodeAt(at);
      if (code < 0x20) fail();
      if (text[at] === "\\") {
        at++;
        if (text[at] === "u") {
          at++;
          HEX4.lastIndex = at;
          if (!HEX4.test(text)) fail();
          at += 4;
        } else {
          if (!ESCAPES.has(text[at])) fail();
          at++;
        }
      } else {
        at++;
      }
    }
    expect('"');
  };

  const scanValue = (): void => {
    skipWhitespace();
    const char = text[at];
    if (char === "{") {
      at++;
      skipWhitespace();
      const keys: string[] = [];
      if (text[at] === "}") {
        at++;
        visitor.object?.(keys);
        return;
      }
      for (;;) {
        skipWhitespace();
        const keyStart = at;
        scanString();
        keys.push(text.slice(keyStart, at));
        skipWhitespace();
        expect(":");
        scanValue();
        skipWhitespace();
        if (text[at] === ",") {
          at++;
          continue;
        }
        expect("}");
        visitor.object?.(keys);
        return;
      }
    }
    if (char === "[") {
      at++;
      skipWhitespace();
      if (text[at] === "]") {
        at++;
        return;
      }
      for (;;) {
        scanValue();
        skipWhitespace();
        if (text[at] === ",") {
          at++;
          continue;
        }
        expect("]");
        return;
      }
    }
    if (char === '"') return scanString();
    for (const word of ["true", "false", "null"]) {
      if (text.startsWith(word, at)) {
        at += word.length;
        return;
      }
    }
    NUMBER.lastIndex = at;
    const match = NUMBER.exec(text);
    if (!match || match[0] === "") fail();
    const start = at;
    at += match![0].length;
    // A leading zero followed by a digit ("01") is not a number.
    if (/[0-9]/.test(text[at] ?? "")) fail();
    visitor.number?.(start, at);
  };

  try {
    scanValue();
    skipWhitespace();
    if (at < text.length) fail();
    return null;
  } catch (error) {
    if (error instanceof ScanError) return error.offset;
    throw error;
  }
}
