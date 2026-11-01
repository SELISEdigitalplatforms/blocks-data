import { describe, expect, it } from "vitest";
import cases from "./rule-message-cases.json";
import { describeRelativeNow, isRelativeNowWritten, parseRelativeNow, relativeNowFrom, relativeNowText } from "./relative-now";

describe("dates relative to now: the same grammar as Genesis RelativeNow", () => {
  it.each(cases.relativeNow.valid)("reads %s", (text) => {
    expect(parseRelativeNow(text)).not.toBeNull();
    expect(isRelativeNowWritten(text)).toBe(true);
  });

  it.each(cases.relativeNow.invalid)("refuses %s, which is still meant as now", (text) => {
    expect(parseRelativeNow(text)).toBeNull();
    expect(isRelativeNowWritten(text)).toBe(true);
  });

  it.each(cases.relativeNow.notThisForm)("leaves %s alone", (text) => {
    expect(isRelativeNowWritten(text)).toBe(false);
  });

  it("names the bound as the server's messages do", () => {
    expect(describeRelativeNow(parseRelativeNow("{{Now}}")!)).toBe("now");
    expect(describeRelativeNow(parseRelativeNow("{{Now-18y}}")!)).toBe("now − 18 years");
    expect(describeRelativeNow(parseRelativeNow("{{Now+1mo}}")!)).toBe("now + 1 month");
  });

  it("works out the moment with calendar maths, in UTC: whole days for years, months and days, as the server does", () => {
    const now = new Date(Date.UTC(2026, 9, 25, 10, 30));
    expect(relativeNowFrom(parseRelativeNow("{{Now-18y}}")!, now).toISOString()).toBe("2008-10-25T00:00:00.000Z");
    expect(relativeNowFrom(parseRelativeNow("{{Now+1mo}}")!, now).toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(relativeNowFrom(parseRelativeNow("{{Now+30d}}")!, now).toISOString()).toBe("2026-11-24T00:00:00.000Z");
    expect(relativeNowFrom(parseRelativeNow("{{Now-15min}}")!, now).toISOString()).toBe("2026-10-25T10:15:00.000Z");
    expect(relativeNowFrom(parseRelativeNow("{{Now+2h}}")!, now).toISOString()).toBe("2026-10-25T12:30:00.000Z");
  });

  it("clamps an offset beyond the calendar instead of failing", () => {
    expect(Number.isFinite(relativeNowFrom(parseRelativeNow("{{Now+9999y}}")!, new Date()).getTime())).toBe(true);
  });

  it("clamps to the month's last day, as .NET AddMonths / AddYears do", () => {
    expect(relativeNowFrom(parseRelativeNow("{{Now+1mo}}")!, new Date(Date.UTC(2026, 0, 31))).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(relativeNowFrom(parseRelativeNow("{{Now-1y}}")!, new Date(Date.UTC(2024, 1, 29))).toISOString()).toBe("2023-02-28T00:00:00.000Z");
  });

  it("writes a picked offset back as text", () => {
    expect(relativeNowText({ amount: 0, unit: "" })).toBe("{{Now}}");
    expect(relativeNowText({ amount: -18, unit: "y" })).toBe("{{Now-18y}}");
    expect(relativeNowText({ amount: 30, unit: "d" })).toBe("{{Now+30d}}");
  });
});
