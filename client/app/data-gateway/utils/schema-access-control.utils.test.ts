import { describe, expect, it } from "vitest";
import {
  ruleToText,
  policyRuleToFormRow,
  findFieldAtDottedPath,
  resolveFieldAccessLevel,
} from "./schema-access-control.utils";
import type { IField, IPolicyRule } from "../models/data-service";

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
  describe("ruleToText", () => {
    it("renders a static-value comparison with quotes", () => {
      expect(
        ruleToText(rule({ operator: 0, rightSource: 2, staticValue: "test@x.com" })),
      ).toBe(`Auth's email equals "test@x.com"`);
    });

    it("renders array static values as comma-joined quoted values", () => {
      expect(
        ruleToText(rule({ operator: 8, rightSource: 2, staticValue: ["a", "b"] })),
      ).toBe(`Auth's email is in "a", "b"`);
    });

    it("omits the right side for null operators", () => {
      expect(ruleToText(rule({ operator: 12 }))).toBe("Auth's email is null");
      expect(ruleToText(rule({ operator: 13 }))).toBe("Auth's email is not null");
    });

    it("renders a source/field comparison for schema-field right sources", () => {
      expect(
        ruleToText(
          rule({ leftSource: 0, leftOperand: "userId", operator: 0, rightSource: 1, rightOperand: "ownerId" }),
        ),
      ).toBe("Auth's userId equals Schema Fields's ownerId");
    });

    it("renders a single schema-field right operand", () => {
      expect(
        ruleToText(rule({ operator: 0, rightSource: 1, rightOperand: "a" })),
      ).toBe("Auth's email equals Schema Fields's a");
    });

    it("falls back to placeholders for unknown sources/operators", () => {
      expect(
        ruleToText(rule({ leftSource: 99, operator: 99, rightSource: 2, staticValue: "x" })),
      ).toBe(`Source(99)'s email operator(99) "x"`);
    });

    it("renders empty quotes when static value is null", () => {
      expect(ruleToText(rule({ operator: 0, rightSource: 2, staticValue: null }))).toBe(
        `Auth's email equals ""`,
      );
    });
  });

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
});
