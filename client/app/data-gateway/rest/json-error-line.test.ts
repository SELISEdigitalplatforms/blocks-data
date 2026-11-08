import { describe, expect, it } from "vitest";
import { jsonErrorLine } from "./json-error-line";

describe("jsonErrorLine: the line of the first JSON syntax error", () => {
  it.each([
    '{"a": 1}',
    "[]",
    ' \n\t{ "a": [1, -2.5e3, true, false, null, "x\\n\\u00e9"] }\n',
    '"text"',
    "0",
  ])("returns null for valid JSON %j", (text) => {
    expect(jsonErrorLine(text)).toBeNull();
  });

  it.each([
    ['{\n  "a": }', 2],
    ['{\n  "a": 1,\n}', 3],
    ["{\n  'a': 1\n}", 2],
    ['{\n  "a": 1\n', 3],
    ['{"a": 1} x', 1],
    ['[\n1,\n2\n3]', 4],
    ['{\n "a": 01\n}', 2],
    ['{\n "a": "x\ny"\n}', 2],
    ['{\n "a": tru\n}', 2],
    ['{\n "a": "\\q"\n}', 2],
    ["", 1],
  ])("finds the error in %j on line %i", (text, line) => {
    expect(jsonErrorLine(text)).toBe(line);
  });

  it("reports the end of the text, instead of throwing, when the text is nested too deep to scan", () => {
    // 20000 levels, one closing brace short, so JSON.parse fails and the recursive scanner is asked for the line.
    const text = `${'{"a":'.repeat(20_000)}\n1${"}".repeat(19_999)}`;
    expect(jsonErrorLine(text)).toBe(2);
  });
});
