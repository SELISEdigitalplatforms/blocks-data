import { describe, expect, it } from "vitest";
import { isAnalyticsAccessible } from "./analytics-access.util";

const now = new Date("2026-09-13T12:00:00Z");

describe("isAnalyticsAccessible", () => {
  it("allows enabled analytics within the configured window", () => {
    expect(
      isAnalyticsAccessible(
        {
          enableAnalytics: true,
          enableDate: "2026-09-01T00:00:00Z",
          validTill: "2026-09-15T00:00:00Z",
        },
        now,
      ),
    ).toBe(true);
  });

  it("denies disabled, future, and expired analytics", () => {
    expect(
      isAnalyticsAccessible(
        { enableAnalytics: false, enableDate: null, validTill: null },
        now,
      ),
    ).toBe(false);
    expect(
      isAnalyticsAccessible(
        {
          enableAnalytics: true,
          enableDate: "2026-09-14T00:00:00Z",
          validTill: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isAnalyticsAccessible(
        {
          enableAnalytics: true,
          enableDate: null,
          validTill: "2026-09-12T00:00:00Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("denies access when valid-till is null", () => {
    expect(
      isAnalyticsAccessible(
        {
          enableAnalytics: true,
          enableDate: "2020-01-01T00:00:00Z",
          validTill: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("denies access when valid-till is not a valid date", () => {
    expect(
      isAnalyticsAccessible(
        {
          enableAnalytics: true,
          enableDate: null,
          validTill: "not-a-date",
        },
        now,
      ),
    ).toBe(false);
  });

  it("denies configurations without the nested analytics object", () => {
    expect(isAnalyticsAccessible(undefined, now)).toBe(false);
  });
});
