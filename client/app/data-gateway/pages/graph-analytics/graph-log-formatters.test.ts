import { describe, expect, it } from "vitest";

import { formatBucketLabel, formatDayLabel, showSeriesMarkers } from "./graph-log-formatters";

describe("formatBucketLabel", () => {
  it("reads a day bucket as a calendar date, without shifting it into local time", () => {
    // A UTC midnight converted to a local instant would land on 30 Aug west of UTC.
    expect(formatBucketLabel("2026-08-31T00:00:00Z", "daily")).toBe("31 Aug");
    expect(formatDayLabel("2026-08-31T00:00:00Z")).toBe("31 Aug");
  });

  it("reads an hourly bucket as an instant, so it shows the viewer's own clock", () => {
    const label = formatBucketLabel("2026-08-31T09:00:00Z", "hourly");
    expect(label).toMatch(/^\d{1,2} Aug \d{2}:\d{2}$/);
  });
});

describe("showSeriesMarkers", () => {
  it("marks sparse series, which a line alone would leave blank", () => {
    // The bug this exists for: a week-long range where only one day saw traffic.
    expect(showSeriesMarkers(1)).toBe(true);
    expect(showSeriesMarkers(8)).toBe(true);
  });

  it("drops markers once they would read as noise", () => {
    expect(showSeriesMarkers(192)).toBe(false);
  });
});
