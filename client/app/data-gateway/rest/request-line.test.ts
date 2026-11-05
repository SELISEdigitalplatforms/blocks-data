import { describe, expect, it } from "vitest";
import { joinRequestLine, splitRequestLine } from "./request-line";

describe("request line", () => {
  it("splits and joins", () => {
    expect(splitRequestLine("/E?pageNo=1&order=Name:ASC")).toEqual({
      path: "/E",
      query: [
        ["pageNo", "1"],
        ["order", "Name:ASC"],
      ],
    });
    expect(
      joinRequestLine("/E", [
        ["pageNo", "1"],
        ["", "x"],
        ["order", "Name:ASC"],
      ]),
    ).toBe("/E?pageNo=1&order=Name:ASC");
    expect(joinRequestLine("/E", [])).toBe("/E");
  });

  it("keeps : and , readable", () => {
    expect(joinRequestLine("/E", [["order", "Name:ASC"]])).toBe("/E?order=Name:ASC");
    expect(joinRequestLine("/E", [["select", "A,B"]])).toBe("/E?select=A,B");
  });

  it("encodes a space as %20, not +", () => {
    expect(joinRequestLine("/E", [["filter", "a b"]])).toBe("/E?filter=a%20b");
  });

  it("encodes the characters that would end or split a pair", () => {
    expect(joinRequestLine("/E", [["q", "#?&="]])).toBe("/E?q=%23%3F%26%3D");
  });

  it("does not throw on a lone surrogate and encodes U+FFFD in its place", () => {
    expect(joinRequestLine("/E", [["k", "a\uD800b"]])).toBe("/E?k=a%EF%BF%BDb");
    expect(joinRequestLine("/E", [["k\uDC00", "x"]])).toBe("/E?k%EF%BF%BD=x");
    // A valid pair is kept.
    expect(joinRequestLine("/E", [["k", "\uD83D\uDE00"]])).toBe("/E?k=%F0%9F%98%80");
  });

  it("round-trips through split", () => {
    const query: [string, string][] = [
      ["order", "Name:ASC"],
      ["select", "A,B"],
      ["filter", "a b"],
      ["q", "#?&=+%"],
      ["k:1,2", "v"],
    ];
    expect(splitRequestLine(joinRequestLine("/E", query))).toEqual({ path: "/E", query });
  });

  it("splits a line with no query", () => {
    expect(splitRequestLine("/E")).toEqual({ path: "/E", query: [] });
  });
});
