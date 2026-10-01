import { describe, expect, it } from "vitest";

import type { IPolicyItem, IPolicyRule } from "../models/data-service";
import { accessEffect, rulePhrase, ruleSetLines, verbPhrase } from "./access-phrase";

const rule = (over: Partial<IPolicyRule> = {}): IPolicyRule => ({
  leftSource: 1,
  leftOperand: "OwnerId",
  operator: 0,
  rightSource: 0,
  rightOperand: "UserId",
  staticValue: null,
  ...over,
});

const policy = (over: Partial<IPolicyItem> = {}): IPolicyItem =>
  ({
    policyName: "Owner access",
    policyType: 0,
    operation: 0,
    entityName: "Order",
    schemaId: "s1",
    fieldNames: [],
    ruleGroup: { logicalOperator: 0, rules: [rule()], nestedGroups: [] },
    priority: 0,
    isAllowPolicy: true,
    projectKey: "pk",
    ...over,
  }) as IPolicyItem;

describe("rulePhrase", () => {
  it("names both sides by where they come from", () => {
    expect(rulePhrase(rule())).toBe(
      "the record's OwnerId equals the signed-in user's UserId",
    );
  });

  it("quotes a static value", () => {
    expect(rulePhrase(rule({ rightSource: 2, staticValue: "Active" }))).toBe(
      "the record's OwnerId equals “Active”",
    );
  });

  it("reads a static list as alternatives", () => {
    expect(
      rulePhrase(rule({ operator: 8, rightSource: 2, staticValue: ["A", "B"] })),
    ).toBe("the record's OwnerId is in “A” or “B”");
  });

  // IS_NULL / IS_NOT_NULL take no right-hand side.
  it("stops after the operator when there is no right side", () => {
    expect(rulePhrase(rule({ operator: 12 }))).toBe("the record's OwnerId is null");
    expect(rulePhrase(rule({ operator: 13 }))).toBe("the record's OwnerId is not null");
  });

  it("prefers rightOperands over rightOperand when both are present", () => {
    expect(
      rulePhrase(rule({ rightOperand: "UserId", rightOperands: ["Roles", "Teams"] })),
    ).toBe("the record's OwnerId equals the signed-in user's Roles, Teams");
  });
});

describe("ruleSetLines", () => {
  it("leads with 'when' and joins on the set's own operator", () => {
    const and = ruleSetLines(
      policy({
        ruleGroup: {
          logicalOperator: 0,
          rules: [rule(), rule({ leftOperand: "Status" })],
          nestedGroups: [],
        },
      }),
    );
    expect(and.map((l) => l.lead)).toEqual(["when", "and"]);

    const or = ruleSetLines(
      policy({
        ruleGroup: {
          logicalOperator: 1,
          rules: [rule(), rule({ leftOperand: "Status" })],
          nestedGroups: [],
        },
      }),
    );
    expect(or.map((l) => l.lead)).toEqual(["when", "or"]);
  });
});

describe("accessEffect", () => {
  const base = { tab: "view", subject: "Order" } as const;

  it("calls public what it is", () => {
    const effect = accessEffect({ ...base, tier: "public" });
    expect(effect.risk).toBe("open");
    expect(effect.text).toContain("Anyone on the internet can read Order");
  });

  it("says signed-in access carries no further checks", () => {
    const effect = accessEffect({ ...base, tier: "user" });
    expect(effect.risk).toBe("caution");
    expect(effect.text).toContain("with no further checks");
  });

  it("does not guess what inherited resolves to", () => {
    expect(accessEffect({ ...base, tier: "inherited" }).risk).toBe("inherited");
  });

  // The trap this phase exists to close: it looks configured, it grants nothing.
  it("warns that custom with no rule sets allows nobody", () => {
    const effect = accessEffect({ ...base, tier: "custom", policies: [] });
    expect(effect.risk).toBe("none");
    expect(effect.text).toBe(
      "A custom policy with no rule sets allows nobody to read Order.",
    );
  });

  it("names the single rule set that grants access", () => {
    const effect = accessEffect({ ...base, tier: "custom", policies: [policy()] });
    expect(effect.risk).toBe("scoped");
    expect(effect.text).toBe(
      "A signed-in user can read Order when Owner access matches.",
    );
  });

  // Rule sets combine with OR, so any one of them is enough.
  it("spells out that any one of several sets is enough", () => {
    const effect = accessEffect({
      ...base,
      tier: "custom",
      policies: [
        policy(),
        policy({ policyName: "Support override" }),
        policy({ policyName: "Admin" }),
      ],
    });
    expect(effect.text).toBe(
      "A signed-in user can read Order when any of these 3 rule sets match: " +
        "Owner access, Support override, or Admin.",
    );
  });

  // "Granted when any rule set matches" is only true of allow-policies, and a
  // schema import can bring in a deny policy the editor cannot show.
  it("refuses to summarise when a deny policy is present", () => {
    const effect = accessEffect({
      ...base,
      tier: "custom",
      policies: [policy(), policy({ policyName: "Blocked", isAllowPolicy: false })],
    });
    expect(effect.risk).toBe("unknown");
    expect(effect.text).not.toContain("can read Order when");
    expect(effect.heading).toBe("Cannot be summarised");
  });

  it("uses each verb the way it reads in a sentence", () => {
    expect(verbPhrase("view")).toBe("read");
    expect(verbPhrase("create")).toBe("create records in");
    expect(accessEffect({ ...base, tab: "delete", tier: "public" }).text).toContain(
      "delete from Order",
    );
  });

  it("describes a field subject the same way", () => {
    const effect = accessEffect({
      tab: "edit",
      subject: "Order.Email",
      tier: "public",
    });
    expect(effect.text).toContain("edit Order.Email");
  });
});
