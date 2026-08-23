import { describe, expect, it } from "vitest";
import {
  createEmptyAccessRuleSet,
  normalizeAccessRuleSet,
  normalizeSchemaFields,
  getTotalValidationRulesIncludingNested,
  hasActiveValidationIncludingNested,
  getValidationDisplayInfo,
  buildValidationFieldName,
  mergeFieldsWithParentData,
} from "./schema-normalization";
import type {
  IField,
  IFieldValidationRule,
  IRemoteSchemaField,
} from "@/data-gateway/models/data-service";

const validationRule = (active: boolean[]): IFieldValidationRule =>
  ({
    validations: active.map((isActive, i) => ({
      type: 0,
      value: "",
      secondaryValue: "",
      errorMessage: "",
      isActive,
      id: `v${i}`,
    })),
  }) as unknown as IFieldValidationRule;

describe("schema-normalization", () => {
  describe("createEmptyAccessRuleSet", () => {
    it("returns empty lists", () => {
      expect(createEmptyAccessRuleSet()).toEqual({ roles: [], permissions: [], users: [] });
    });
  });

  describe("normalizeAccessRuleSet", () => {
    it("returns empty set for undefined access", () => {
      expect(normalizeAccessRuleSet()).toEqual({ roles: [], permissions: [], users: [] });
    });

    it("trims + de-duplicates and treats null lists as empty", () => {
      expect(
        normalizeAccessRuleSet({ roles: [" a ", "a", "b"], permissions: null, users: [""] }),
      ).toEqual({ roles: ["a", "b"], permissions: [], users: [] });
    });
  });

  describe("normalizeSchemaFields", () => {
    it("returns [] for an empty / omitted list", () => {
      expect(normalizeSchemaFields()).toEqual([]);
      expect(normalizeSchemaFields([])).toEqual([]);
    });

    it("applies defaults for optional properties", () => {
      const [field] = normalizeSchemaFields([
        { name: "title", type: "String", isArray: false } as IRemoteSchemaField,
      ]);
      expect(field).toMatchObject({
        name: "title",
        type: "String",
        isArray: false,
        isPIIData: false,
        isUniqueData: false,
        description: "",
        totalRoles: 0,
        totalUsers: 0,
        totalPermissions: 0,
        totalValidationRules: 0,
        validationRule: null,
      });
      expect(field.readAccess).toEqual({ roles: [], permissions: [], users: [] });
      expect(field.fields).toBeUndefined();
    });

    it("normalizes provided access rule sets and preserves access levels", () => {
      const [field] = normalizeSchemaFields([
        {
          name: "email",
          type: "String",
          isArray: false,
          isPIIData: true,
          readAccess: { roles: [" admin ", "admin"], permissions: null, users: null },
          readAccessLevel: 3,
          writeAccessLevel: 1,
        } as IRemoteSchemaField,
      ]);
      expect(field.isPIIData).toBe(true);
      expect(field.readAccess).toEqual({ roles: ["admin"], permissions: [], users: [] });
      expect(field.readAccessLevel).toBe(3);
      expect(field.writeAccessLevel).toBe(1);
    });

    it("recursively normalizes nested fields", () => {
      const [field] = normalizeSchemaFields([
        {
          name: "address",
          type: "Address",
          isArray: false,
          fields: [{ name: "city", type: "String", isArray: false }],
        } as IRemoteSchemaField,
      ]);
      expect(field.fields).toHaveLength(1);
      expect(field.fields?.[0].name).toBe("city");
      expect(field.fields?.[0].description).toBe("");
    });
  });

  describe("getTotalValidationRulesIncludingNested", () => {
    it("returns 0 for undefined field", () => {
      expect(getTotalValidationRulesIncludingNested(undefined)).toBe(0);
    });

    it("returns own count when there are no nested fields", () => {
      expect(
        getTotalValidationRulesIncludingNested({ totalValidationRules: 2 } as IField),
      ).toBe(2);
    });

    it("treats missing totalValidationRules as 0", () => {
      expect(getTotalValidationRulesIncludingNested({} as IField)).toBe(0);
    });

    it("sums across arbitrarily nested fields", () => {
      const field = {
        totalValidationRules: 1,
        fields: [
          { totalValidationRules: 2 },
          { totalValidationRules: 3, fields: [{ totalValidationRules: 4 }] },
        ],
      } as IField;
      expect(getTotalValidationRulesIncludingNested(field)).toBe(10);
    });
  });

  describe("hasActiveValidationIncludingNested", () => {
    it("false for undefined field", () => {
      expect(hasActiveValidationIncludingNested(undefined)).toBe(false);
    });

    it("true when the field itself has an active validation", () => {
      expect(
        hasActiveValidationIncludingNested({ validationRule: validationRule([false, true]) } as IField),
      ).toBe(true);
    });

    it("true when only a nested field is active", () => {
      const field = {
        validationRule: validationRule([false]),
        fields: [{ validationRule: validationRule([true]) }],
      } as IField;
      expect(hasActiveValidationIncludingNested(field)).toBe(true);
    });

    it("false when nothing is active", () => {
      const field = {
        validationRule: validationRule([false]),
        fields: [{ validationRule: validationRule([false]) }],
      } as IField;
      expect(hasActiveValidationIncludingNested(field)).toBe(false);
    });
  });

  describe("getValidationDisplayInfo", () => {
    it("combines total count and active flag", () => {
      const field = {
        totalValidationRules: 1,
        validationRule: validationRule([true]),
        fields: [{ totalValidationRules: 2, validationRule: validationRule([false]) }],
      } as IField;
      expect(getValidationDisplayInfo(field)).toEqual({ total: 3, hasActive: true });
    });

    it("handles undefined field", () => {
      expect(getValidationDisplayInfo(undefined)).toEqual({ total: 0, hasActive: false });
    });
  });

  describe("buildValidationFieldName", () => {
    it("returns the bare field name with an empty ancestor path", () => {
      expect(buildValidationFieldName([], "name")).toBe("name");
    });

    it("joins ancestors with dots", () => {
      expect(buildValidationFieldName(["Products"], "name")).toBe("Products.name");
      expect(buildValidationFieldName(["a", "b"], "c")).toBe("a.b.c");
    });
  });

  describe("mergeFieldsWithParentData", () => {
    it("returns child fields unchanged when there is no parent data", () => {
      const children = [{ name: "a", type: "String", isArray: false } as IField];
      expect(mergeFieldsWithParentData(children)).toBe(children);
      expect(mergeFieldsWithParentData(children, [])).toBe(children);
    });

    it("materializes parent fields when child list is empty", () => {
      const result = mergeFieldsWithParentData([], [
        { name: "title", readAccessLevel: 2, fields: [{ name: "sub" }] },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: "title",
        type: "String",
        isArray: false,
        readAccessLevel: 2,
      });
      expect(result[0].fields?.[0].name).toBe("sub");
    });

    it("merges matching parent data case-insensitively", () => {
      const children = [
        { name: "Name", type: "String", isArray: false, readAccessLevel: 1 } as IField,
        { name: "Other", type: "String", isArray: false } as IField,
      ];
      const merged = mergeFieldsWithParentData(children, [
        { name: "name", readAccessLevel: 5, totalValidationRules: 3 },
      ]);
      expect(merged[0].readAccessLevel).toBe(5);
      expect(merged[0].totalValidationRules).toBe(3);
      // Non-matching child is returned untouched.
      expect(merged[1]).toBe(children[1]);
    });

    it("uses the entity nested field as the source of truth for field metadata", () => {
      const children = [{
        name: "HouseNo",
        type: "String",
        isArray: false,
        isPIIData: false,
        isUniqueData: false,
        requiredOn: "None",
        description: "stale",
      } as IField];

      const [merged] = mergeFieldsWithParentData(children, [{
        name: "HouseNo",
        type: "Int",
        isArray: true,
        isPIIData: true,
        isUniqueData: true,
        requiredOn: "Both",
        description: "current",
      }]);

      expect(merged).toMatchObject({
        type: "Int",
        isArray: true,
        isPIIData: true,
        isUniqueData: true,
        requiredOn: "Both",
        description: "current",
      });
    });

    it("recursively merges nested fields", () => {
      const children = [
        {
          name: "address",
          type: "Address",
          isArray: false,
          fields: [{ name: "city", type: "String", isArray: false, readAccessLevel: 1 } as IField],
        } as IField,
      ];
      const merged = mergeFieldsWithParentData(children, [
        { name: "address", fields: [{ name: "city", readAccessLevel: 9 }] },
      ]);
      expect(merged[0].fields?.[0].readAccessLevel).toBe(9);
    });
  });
});
