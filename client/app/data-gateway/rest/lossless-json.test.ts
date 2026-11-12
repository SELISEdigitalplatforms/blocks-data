import { afterEach, describe, expect, it, vi } from "vitest";
import { prettyPrintJsonLossless, transformJsonLossless } from "./lossless-json";

const identity = (value: unknown) => value;
const ok = (text: string) => ({ ok: true, text });
/** Valid JSON nested 20000 levels deep: deeper than the recursive scanner can follow. */
const DEEP = `${'{"a":'.repeat(20_000)}1${"}".repeat(20_000)}`;

/** A fixed nonce, so a test can learn the sentinel and put it in the user's own text. */
const fixedNonce = <T extends ArrayBufferView | null>(array: T) => {
  (array as unknown as Uint32Array).fill(7);
  return array;
};

/** The sentinel the fixed nonce gives the first number. */
const learnSentinel = () => {
  let sentinel = "";
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementationOnce(fixedNonce);
  transformJsonLossless("1", (value) => {
    sentinel = value as string;
    return value;
  });
  vi.restoreAllMocks();
  expect(sentinel).toMatch(/^__lossless_json_/);
  return sentinel;
};

/**
 * Every nonce is the fixed one. A synchronous loop can't be stopped by a test timeout, so this fails the test once
 * the transform draws far more nonces than it should.
 */
const alwaysFixedNonce = () => {
  let drawn = 0;
  return vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
    if (++drawn > 20) throw new Error("drew more than 20 nonces: the retry loop does not end");
    return fixedNonce(array);
  });
};

afterEach(() => vi.restoreAllMocks());

describe("transformJsonLossless", () => {
  it.each([
    ["9007199254740993", "9007199254740993"],
    ['{"id":9007199254740993}', '{"id":9007199254740993}'],
    ['{"a":1.0}', '{"a":1.0}'],
    ['{"a":-0}', '{"a":-0}'],
    ['{"a":1e400}', '{"a":1e400}'],
    ['{"a":-1.5E-7}', '{"a":-1.5E-7}'],
    ["[12345678901234567890, 0.10000000000000000001]", "[12345678901234567890,0.10000000000000000001]"],
  ])("keeps the number text of %s exactly", (text, expected) => {
    expect(transformJsonLossless(text, identity)).toEqual(ok(expected));
  });

  it("keeps numbers inside nested arrays and objects", () => {
    const text = '{"a":[1.0,{"b":[9007199254740993,[-0]]}],"c":{"d":{"e":1e400}}}';
    expect(transformJsonLossless(text, identity)).toEqual(ok(text));
  });

  it("leaves numbers inside strings and keys untouched", () => {
    const text = '{"9007199254740993":"1.0 and -0","s":"x\\"1e400\\"y","n":2}';
    expect(transformJsonLossless(text, identity)).toEqual(ok(text));
  });

  it("runs the transform on the parsed value and keeps the numbers it carries over", () => {
    const out = transformJsonLossless('{"Id":9007199254740993,"Price":1.0}', (value) => ({
      ...(value as object),
      Tags: ["mock-data"],
    }));
    expect(out).toEqual(ok('{"Id":9007199254740993,"Price":1.0,"Tags":["mock-data"]}'));
  });

  it("indents with space", () => {
    expect(transformJsonLossless('{"a":[1.0]}', identity, 2)).toEqual(ok('{\n  "a": [\n    1.0\n  ]\n}'));
  });

  it("keeps true, false, null and strings as JSON.stringify writes them", () => {
    const text = '{ "t": true, "f": false, "n": null, "s": "\\u00e9\\n" }';
    expect(transformJsonLossless(text, identity)).toEqual(ok(JSON.stringify(JSON.parse(text))));
  });

  it("a user string or key holding the nonce makes it pick another nonce, and the numbers stay exact", () => {
    const sentinel = learnSentinel();
    // The same nonce comes first, so it has to be refused. The key holds it only once its escape is decoded.
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementationOnce(fixedNonce);
    const escapedKey = JSON.stringify(sentinel).replace("_", "\\u005f");
    const text = `{"s":${JSON.stringify(sentinel)},"n":9007199254740993,"k":{${escapedKey}:0}}`;
    const expected = `{"s":${JSON.stringify(sentinel)},"n":9007199254740993,"k":{${JSON.stringify(sentinel)}:0}}`;
    expect(transformJsonLossless(text, identity)).toEqual(ok(expected));
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("draws one nonce when no user string holds it", () => {
    const random = vi.spyOn(globalThis.crypto, "getRandomValues");
    expect(transformJsonLossless('{"s":"x","n":1}', identity)).toEqual(ok('{"s":"x","n":1}'));
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("gives up after 5 nonces that all collide", { timeout: 1000 }, () => {
    const sentinel = learnSentinel();
    const random = alwaysFixedNonce();
    expect(transformJsonLossless(`[${JSON.stringify(sentinel)},1]`, identity)).toEqual({
      ok: false,
      reason: "nonce-collision",
    });
    expect(random).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['{"Name":"a","Age":1,"Age":2}', "Age"],
    ['[{"A":{"x":1},"A":{"y":"s"}}]', "A"],
    ['{"a":{"k":1,"\\u006b":2}}', "k"],
  ])("refuses %s, which has the duplicate key %s, without looping", { timeout: 1000 }, (text, key) => {
    alwaysFixedNonce();
    const transform = vi.fn(identity);
    expect(transformJsonLossless(text, transform)).toEqual({ ok: false, reason: "duplicate-key", key });
    expect(transform).not.toHaveBeenCalled();
  });

  it("refuses text nested too deep to scan", () => {
    expect(transformJsonLossless(DEEP, identity)).toEqual({ ok: false, reason: "too-deep" });
  });

  it("transforms a tagged body nested 3000 levels deep, as deep as the scanner follows in a cold test run", () => {
    // The nonce check and every other walk over the parsed value are iterative; only the scanner is recursive.
    const text = `${'{"a":'.repeat(3000)}1.0${"}".repeat(3000)}`;
    expect(transformJsonLossless(text, identity)).toEqual(ok(text));
  });

  it("transforms a flat array of 200000 elements", () => {
    const text = `[${"0,".repeat(200_000)}0]`;
    expect(transformJsonLossless(text, identity)).toEqual(ok(text));
  });

  it("refuses text that is not JSON", () => {
    expect(transformJsonLossless("{", identity)).toEqual({ ok: false, reason: "invalid-json" });
  });
});

describe("prettyPrintJsonLossless", () => {
  it("pretty-prints with two spaces and keeps the numbers exact", () => {
    expect(prettyPrintJsonLossless('{"id":9007199254740993,"a":[1.0,-0,1e400]}')).toBe(
      '{\n  "id": 9007199254740993,\n  "a": [\n    1.0,\n    -0,\n    1e400\n  ]\n}',
    );
  });

  it("returns null when the text is not JSON", () => {
    expect(prettyPrintJsonLossless("upstream connect error")).toBeNull();
    expect(prettyPrintJsonLossless('{"a":}')).toBeNull();
    expect(prettyPrintJsonLossless("")).toBeNull();
  });

  it("returns the text unchanged when an object has a duplicate key, so no member is dropped", () => {
    const text = '{"a":1,"b":{"x":1,"x":2}}';
    expect(prettyPrintJsonLossless(text)).toBe(text);
    // Escapes are decoded before comparing keys.
    const escaped = '{"a":1,"\\u0061":2}';
    expect(prettyPrintJsonLossless(escaped)).toBe(escaped);
  });

  it("returns null for text nested too deep to scan, valid or not, instead of throwing", () => {
    expect(prettyPrintJsonLossless(DEEP)).toBeNull();
    expect(prettyPrintJsonLossless(`${DEEP}x`)).toBeNull();
    const deepArrays = `${"[".repeat(100_000)}${"]".repeat(100_000)}`;
    expect(prettyPrintJsonLossless(deepArrays)).toBeNull();
  });

  it("pretty-prints a flat array of 200000 elements", () => {
    const pretty = prettyPrintJsonLossless(`[${"0,".repeat(200_000)}0]`);
    expect(pretty).not.toBeNull();
    expect(pretty!.split("\n")).toHaveLength(200_003);
  });

  it("the same key in different objects is not a duplicate", () => {
    expect(prettyPrintJsonLossless('[{"a":1},{"a":2}]')).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]');
  });
});
