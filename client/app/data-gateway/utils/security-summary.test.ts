import { describe, expect, it } from "vitest";

import type { Schema } from "../models/security-and-performance";
import {
  exposureBreakdown,
  filterCounts,
  piiFieldCount,
  schemaRisk,
  securityAlerts,
  sortByRisk,
} from "./security-summary";

/** SchemaAccessLevel: Inherited=0, User=1, Public=2, Custom=3. */
const schema = (
  schemaName: string,
  [read, write, edit, del]: [number, number, number, number],
  fields: { name: string; isPIIData?: boolean }[] = [],
): Schema =>
  ({
    id: schemaName,
    schemaName,
    readAccessLevel: read,
    writeAccessLevel: write,
    editAccessLevel: edit,
    deleteAccessLevel: del,
    fields,
  }) as Schema;

describe("schemaRisk", () => {
  // Which write verb is open matters less than the fact that one is.
  it.each([
    ["write", [3, 2, 3, 3]],
    ["edit", [3, 3, 2, 3]],
    ["delete", [3, 3, 3, 2]],
  ])("treats public %s as public write", (_verb, levels) => {
    expect(schemaRisk(schema("S", levels as [number, number, number, number])).key).toBe(
      "public-write",
    );
  });

  it("ranks public write above public read", () => {
    expect(schemaRisk(schema("S", [2, 2, 3, 3])).key).toBe("public-write");
    expect(schemaRisk(schema("S", [2, 3, 3, 3])).key).toBe("public-read");
  });

  it("ranks public read above signed-in write", () => {
    expect(schemaRisk(schema("S", [2, 1, 3, 3])).key).toBe("public-read");
  });

  it("calls signed-in read low severity, since it is the default", () => {
    const risk = schemaRisk(schema("S", [1, 3, 3, 3]));
    expect(risk.key).toBe("user-read");
    expect(risk.severity).toBe("low");
  });

  it("marks anything public as high severity", () => {
    expect(schemaRisk(schema("S", [2, 3, 3, 3])).severity).toBe("high");
    expect(schemaRisk(schema("S", [3, 2, 3, 3])).severity).toBe("high");
  });

  it("falls through to custom, then inherited", () => {
    expect(schemaRisk(schema("S", [3, 3, 3, 3])).key).toBe("custom");
    expect(schemaRisk(schema("S", [0, 0, 0, 0])).key).toBe("inherited");
  });
});

describe("sortByRisk", () => {
  it("puts the most exposed first and breaks ties by name", () => {
    const sorted = sortByRisk([
      schema("Zebra", [0, 0, 0, 0]),
      schema("Payment", [2, 3, 3, 3]),
      schema("Alpha", [0, 0, 0, 0]),
      schema("Orders", [3, 2, 3, 3]),
    ]);

    expect(sorted.map((s) => s.schemaName)).toEqual([
      "Orders",
      "Payment",
      "Alpha",
      "Zebra",
    ]);
  });

  it("leaves the input untouched", () => {
    const input = [schema("B", [0, 0, 0, 0]), schema("A", [2, 3, 3, 3])];
    sortByRisk(input);
    expect(input.map((s) => s.schemaName)).toEqual(["B", "A"]);
  });
});

describe("filterCounts", () => {
  it("counts each chip over the fetched set", () => {
    const counts = filterCounts([
      schema("A", [2, 3, 3, 3]),
      schema("B", [3, 2, 3, 3]),
      schema("C", [1, 1, 3, 3]),
      schema("D", [3, 3, 3, 3]),
    ]);

    expect(counts).toEqual({ all: 4, attention: 2, public: 2, user: 1, custom: 1 });
  });
});

describe("exposureBreakdown", () => {
  // Each schema carries four grants; the server counts only the three levels
  // that are set, so inherited is the remainder.
  it("derives inherited from what the aggregation does not count", () => {
    const { segments, totalGrants } = exposureBreakdown(
      {
        totalPublicPermission: 2,
        totalUserPermission: 4,
        totalCustomPermission: 6,
      },
      10,
    );

    expect(totalGrants).toBe(40);
    expect(segments.map((s) => [s.tier, s.count])).toEqual([
      ["public", 2],
      ["user", 4],
      ["custom", 6],
      ["inherited", 28],
    ]);
  });

  it("never reports a negative remainder", () => {
    const { segments } = exposureBreakdown(
      { totalPublicPermission: 99, totalUserPermission: 0, totalCustomPermission: 0 },
      1,
    );
    expect(segments.find((s) => s.tier === "inherited")?.count).toBe(0);
  });

  it("gives widths that fill the bar", () => {
    const { segments } = exposureBreakdown(
      { totalPublicPermission: 1, totalUserPermission: 1, totalCustomPermission: 1 },
      1,
    );
    expect(segments.map((s) => s.width)).toEqual(["25%", "25%", "25%", "25%"]);
  });

  it("survives having no aggregation yet", () => {
    expect(exposureBreakdown(undefined, 0).segments.every((s) => s.count === 0)).toBe(true);
    expect(exposureBreakdown(undefined, 0).segments[0].width).toBe("0%");
  });
});

describe("securityAlerts", () => {
  it("counts public write, public read and public PII separately", () => {
    const alerts = securityAlerts([
      schema("A", [2, 2, 3, 3], [{ name: "Email", isPIIData: true }]),
      schema("B", [2, 3, 3, 3]),
      schema("C", [1, 3, 3, 3], [{ name: "Ssn", isPIIData: true }]),
    ]);

    expect(alerts.map((a) => [a.id, a.count])).toEqual([
      ["public-write", 1],
      ["public-read", 1],
      ["public-pii", 1],
    ]);
  });

  // PII behind signed-in access is not the same alarm.
  it("ignores PII on a schema that is not publicly reachable", () => {
    const alerts = securityAlerts([
      schema("C", [1, 3, 3, 3], [{ name: "Ssn", isPIIData: true }]),
    ]);
    expect(alerts.find((a) => a.id === "public-pii")?.count).toBe(0);
  });
});

describe("piiFieldCount", () => {
  it("counts only the fields marked PII", () => {
    expect(
      piiFieldCount(
        schema("A", [1, 1, 1, 1], [
          { name: "Email", isPIIData: true },
          { name: "Total" },
          { name: "Ssn", isPIIData: true },
        ]),
      ),
    ).toBe(2);
  });

  it("reads a schema with no fields as none", () => {
    expect(piiFieldCount(schema("A", [1, 1, 1, 1]))).toBe(0);
  });
});
