import { describe, expect, it } from "vitest";
import {
  countPolicyGroups,
  countPolicyRules,
  formGroupToPolicyGroup,
  policyGroupToFormGroup,
  policyRuleToFormRow,
  findFieldAtDottedPath,
  resolveFieldAccessLevel,
} from "./schema-access-control.utils";
import type { IField, IPolicyRule, IPolicyRuleGroup } from "../models/data-service";

const rule = (overrides: Partial<IPolicyRule>): IPolicyRule => ({
  leftSource: 0,
  leftOperand: "email",
  operator: 0,
  rightSource: 2,
  rightOperand: "",
  staticValue: null,
  ...overrides,
});

const field = (name: string, overrides: Partial<IField> = {}): IField =>
  ({ name, type: "String", isArray: false, ...overrides }) as IField;

describe("schema-access-control.utils", () => {
  describe("policyRuleToFormRow", () => {
    it("maps a basic static equal rule", () => {
      expect(
        policyRuleToFormRow(
          rule({ leftSource: 0, leftOperand: "email", operator: 0, rightSource: 2, staticValue: "x" }),
        ),
      ).toEqual({
        source: "auth",
        field: "email",
        operator: "EQUAL",
        compareSource: "static-value",
        compareValue: "x",
      });
    });

    it("joins array static values with a comma+space for IN operators", () => {
      const row = policyRuleToFormRow(
        rule({ operator: 8, rightSource: 2, staticValue: ["a", "b"] }),
      );
      expect(row.operator).toBe("IN");
      expect(row.compareValue).toBe("a, b");
    });

    it("maps the schema-field operand for IN operators", () => {
      const row = policyRuleToFormRow(
        rule({ operator: 8, rightSource: 1, rightOperand: "AllowedRoles" }),
      );
      expect(row.compareSource).toBe("schema-field");
      expect(row.compareValue).toBe("AllowedRoles");
    });

    it("reads staticValue directly for direct-value operators (START_WITH)", () => {
      const row = policyRuleToFormRow(
        rule({ operator: 10, rightSource: 1, staticValue: "prefix" }),
      );
      expect(row.operator).toBe("START_WITH");
      expect(row.compareValue).toBe("prefix");
    });

    it("uses right operand string for non-static, non-contain sources", () => {
      const row = policyRuleToFormRow(
        rule({ operator: 0, rightSource: 1, rightOperand: "ownerId" }),
      );
      expect(row.compareSource).toBe("schema-field");
      expect(row.compareValue).toBe("ownerId");
    });

    it("falls back to empty string for unknown source/operator", () => {
      const row = policyRuleToFormRow(
        rule({ leftSource: 99, operator: 99, rightSource: 2, staticValue: null }),
      );
      expect(row.source).toBe("");
      expect(row.operator).toBe("");
      expect(row.compareValue).toBe("");
    });
  });

  describe("findFieldAtDottedPath", () => {
    const roots = [
      field("Products", { fields: [field("name"), field("price")] }),
      field("title"),
    ];

    it("resolves a nested field via a dotted path", () => {
      expect(findFieldAtDottedPath(roots, "Products.name")?.name).toBe("name");
    });

    it("resolves a top-level field", () => {
      expect(findFieldAtDottedPath(roots, "Products")?.name).toBe("Products");
      expect(findFieldAtDottedPath(roots, "title")?.name).toBe("title");
    });

    it("returns undefined for missing segments", () => {
      expect(findFieldAtDottedPath(roots, "Products.missing")).toBeUndefined();
      expect(findFieldAtDottedPath(roots, "Missing.name")).toBeUndefined();
    });

    it("returns undefined for an empty path", () => {
      expect(findFieldAtDottedPath(roots, "")).toBeUndefined();
      expect(findFieldAtDottedPath(roots, "...")).toBeUndefined();
    });
  });

  describe("resolveFieldAccessLevel", () => {
    it("resolves a single dotted path via nested lookup", () => {
      const fields = [field("Products", { fields: [field("name", { readAccessLevel: 2 })] })];
      expect(resolveFieldAccessLevel(fields, ["Products.name"], "readAccessLevel")).toBe(2);
    });

    it("falls back to the leaf name when the dotted path is not present", () => {
      const fields = [field("name", { readAccessLevel: 3 })];
      expect(resolveFieldAccessLevel(fields, ["Products.name"], "readAccessLevel")).toBe(3);
    });

    it("returns the shared level when several fields agree", () => {
      const fields = [field("a", { readAccessLevel: 2 }), field("b", { readAccessLevel: 2 })];
      expect(resolveFieldAccessLevel(fields, ["a", "b"], "readAccessLevel")).toBe(2);
    });

    it("returns 1 (mixed) when selected fields disagree", () => {
      const fields = [field("a", { readAccessLevel: 2 }), field("b", { readAccessLevel: 3 })];
      expect(resolveFieldAccessLevel(fields, ["a", "b"], "readAccessLevel")).toBe(1);
    });

    it("returns undefined when no field matches", () => {
      const fields = [field("a", { readAccessLevel: 2 })];
      expect(resolveFieldAccessLevel(fields, ["z"], "readAccessLevel")).toBeUndefined();
    });

    it("handles a single non-dotted field name", () => {
      const fields = [field("a", { writeAccessLevel: 4 })];
      expect(resolveFieldAccessLevel(fields, ["a"], "writeAccessLevel")).toBe(4);
    });
  });

  describe("rule groups", () => {
    const staticRule = (operand: string, value: string): IPolicyRule =>
      rule({
        leftSource: 1,
        leftOperand: operand,
        operator: 0,
        rightSource: 2,
        rightOperand: "",
        rightOperands: [],
        staticValue: value,
      });

    const flat: IPolicyRuleGroup = {
      logicalOperator: 0,
      rules: [staticRule("a", "1"), staticRule("b", "2")],
      nestedGroups: [],
    };

    // (a OR b) AND (c OR d), the root holding no rules of its own.
    const nested: IPolicyRuleGroup = {
      logicalOperator: 0,
      rules: [],
      nestedGroups: [
        { logicalOperator: 1, rules: [staticRule("a", "1"), staticRule("b", "2")], nestedGroups: [] },
        { logicalOperator: 1, rules: [staticRule("c", "3"), staticRule("d", "4")], nestedGroups: [] },
      ],
    };

    it("round-trips a flat group to an identical payload", () => {
      expect(formGroupToPolicyGroup(policyGroupToFormGroup(flat))).toEqual(flat);
    });

    it("round-trips nested groups, keeping each group's own operator", () => {
      const form = policyGroupToFormGroup(nested);
      expect(form.logicalOperator).toBe("AND");
      expect(form.rules).toEqual([]);
      expect(form.nestedGroups.map((g) => g.logicalOperator)).toEqual(["OR", "OR"]);
      expect(formGroupToPolicyGroup(form)).toEqual(nested);
    });

    it("keeps groups nested deeper than the editor builds", () => {
      const deep: IPolicyRuleGroup = {
        logicalOperator: 0,
        rules: [staticRule("a", "1")],
        nestedGroups: [
          {
            logicalOperator: 1,
            rules: [staticRule("b", "2")],
            nestedGroups: [
              {
                logicalOperator: 0,
                rules: [staticRule("c", "3")],
                nestedGroups: [{ logicalOperator: 1, rules: [staticRule("d", "4")], nestedGroups: [] }],
              },
            ],
          },
        ],
      };
      expect(formGroupToPolicyGroup(policyGroupToFormGroup(deep))).toEqual(deep);
    });

    it("reads a group stored without nestedGroups as having none", () => {
      const legacy = { logicalOperator: 1, rules: [staticRule("a", "1")] } as unknown as IPolicyRuleGroup;
      const form = policyGroupToFormGroup(legacy);
      expect(form.logicalOperator).toBe("OR");
      expect(form.nestedGroups).toEqual([]);
    });

    it("counts rules and groups across every level", () => {
      expect(countPolicyRules(flat)).toBe(2);
      expect(countPolicyGroups(flat)).toBe(0);
      expect(countPolicyRules(nested)).toBe(4);
      expect(countPolicyGroups(nested)).toBe(2);
      const legacy = { logicalOperator: 0, rules: [staticRule("a", "1")] } as unknown as IPolicyRuleGroup;
      expect(countPolicyRules(legacy)).toBe(1);
      expect(countPolicyGroups(legacy)).toBe(0);
    });
  });
});
