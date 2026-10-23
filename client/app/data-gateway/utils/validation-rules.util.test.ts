import { describe, expect, it } from "vitest";
import {
  VALIDATION_TYPE as T,
  suggestErrorMessage,
  checkRuleDraft,
  draftFromRule,
  formatRuleSummary,
  getAllowedValidationTypes,
  ruleFromDraft,
  ruleTypeLabel,
  type RuleDraft,
} from "./validation-rules.util";

const draft = (over: Partial<RuleDraft>): RuleDraft => ({
  type: T.NotEmpty,
  value: "",
  secondaryValue: "",
  errorMessage: "",
  isActive: true,
  ...over,
});

describe("getAllowedValidationTypes", () => {
  it("offers text rules and Reference on text fields", () => {
    expect(getAllowedValidationTypes("String")).toEqual([
      T.NotEmpty, T.Regex, T.MinLength, T.MaxLength, T.LengthRange, T.Equal, T.NotEqual, T.Reference,
    ]);
  });

  it("offers comparisons on numbers and dates, Reference only on numbers", () => {
    expect(getAllowedValidationTypes("Int")).toContain(T.Range);
    expect(getAllowedValidationTypes("Int")).toContain(T.Reference);
    expect(getAllowedValidationTypes("DateTime")).toContain(T.GreaterThanOrEqual);
    expect(getAllowedValidationTypes("DateTime")).not.toContain(T.Reference);
  });

  it("keeps booleans, enums and other types to what makes sense", () => {
    expect(getAllowedValidationTypes("Boolean")).toEqual([T.NotEmpty, T.Equal, T.NotEqual]);
    expect(getAllowedValidationTypes("Enum")).toEqual([T.NotEmpty, T.Equal, T.NotEqual, T.Reference]);
    expect(getAllowedValidationTypes("GeoJson")).toEqual([T.NotEmpty]);
  });
});

describe("checkRuleDraft", () => {
  it("needs nothing for Not empty", () => {
    expect(checkRuleDraft(draft({ type: T.NotEmpty }), "String")).toBeNull();
  });

  it("checks regex syntax without running it", () => {
    expect(checkRuleDraft(draft({ type: T.Regex }), "String")).toBe("Pattern is required");
    expect(checkRuleDraft(draft({ type: T.Regex, value: "([a-z" }), "String")).toBe("Invalid regex pattern");
    expect(checkRuleDraft(draft({ type: T.Regex, value: "^[a-z]+$" }), "String")).toBeNull();
  });

  it("wants whole lengths and min ≤ max", () => {
    expect(checkRuleDraft(draft({ type: T.MinLength, value: "-1" }), "String")).not.toBeNull();
    expect(checkRuleDraft(draft({ type: T.MinLength, value: "3" }), "String")).toBeNull();
    expect(checkRuleDraft(draft({ type: T.LengthRange, value: "10", secondaryValue: "3" }), "String")).toBe("Min must be ≤ max");
  });

  it("wants numbers for numeric fields and an ordered range", () => {
    expect(checkRuleDraft(draft({ type: T.GreaterThan, value: "abc" }), "Int")).toBe("Not a valid number");
    expect(checkRuleDraft(draft({ type: T.Range, value: "10", secondaryValue: "1" }), "Float")).toBe("Min must be ≤ max");
    expect(checkRuleDraft(draft({ type: T.Range, value: "1", secondaryValue: "10" }), "Float")).toBeNull();
    expect(checkRuleDraft(draft({ type: T.Range, value: "2025-02-01T00:00", secondaryValue: "2025-01-01T00:00" }), "DateTime")).toBe("Min must be ≤ max");
  });

  it("wants a target schema for Reference", () => {
    expect(checkRuleDraft(draft({ type: T.Reference }), "String")).not.toBeNull();
    expect(checkRuleDraft(draft({ type: T.Reference, value: "Department" }), "String")).toBeNull();
  });
});

describe("ruleFromDraft", () => {
  it("sends lengths and numeric bounds as numbers", () => {
    expect(ruleFromDraft(draft({ type: T.MinLength, value: "3" }), "String")).toMatchObject({ value: 3, secondaryValue: null });
    expect(ruleFromDraft(draft({ type: T.Range, value: "1", secondaryValue: "9.5" }), "Float")).toMatchObject({ value: 1, secondaryValue: 9.5 });
  });

  it("sends booleans as booleans and dates and text as text", () => {
    expect(ruleFromDraft(draft({ type: T.Equal, value: "false" }), "Boolean").value).toBe(false);
    expect(ruleFromDraft(draft({ type: T.GreaterThan, value: "2025-01-01T00:00" }), "DateTime").value).toBe("2025-01-01T00:00");
    expect(ruleFromDraft(draft({ type: T.NotEmpty, value: "ignored" }), "String").value).toBeNull();
  });

  it("marks every rule it builds as version 1 (lists checked item by item)", () => {
    expect(ruleFromDraft(draft({ type: T.MaxLength, value: "20" }), "String").evaluationVersion).toBe(1);
  });

  it("defaults a Reference's target field to ItemId", () => {
    expect(ruleFromDraft(draft({ type: T.Reference, value: "Department" }), "String")).toMatchObject({
      type: T.Reference, value: "Department", secondaryValue: "ItemId",
    });
  });

  it("round-trips through draftFromRule", () => {
    const rule = { type: T.LengthRange, value: 3, secondaryValue: 50, errorMessage: "3–50", isActive: false, evaluationVersion: 1 };
    expect(ruleFromDraft(draftFromRule(rule), "String")).toEqual(rule);
  });
});

describe("formatRuleSummary", () => {
  it("describes each rule in a short line", () => {
    expect(formatRuleSummary({ type: T.LengthRange, value: 3, secondaryValue: 50, errorMessage: "", isActive: true })).toBe("3–50 characters");
    expect(formatRuleSummary({ type: T.GreaterThanOrEqual, value: 18, secondaryValue: null, errorMessage: "", isActive: true })).toBe("≥ 18");
    expect(formatRuleSummary({ type: T.Reference, value: "Department", secondaryValue: null, errorMessage: "", isActive: true })).toBe(
      "Must exist in Department.ItemId",
    );
  });

  it("labels types this client does not know", () => {
    expect(ruleTypeLabel(T.Reference)).toBe("Exists in another schema");
    expect(ruleTypeLabel(99)).toBe("Type 99");
  });
});

describe("suggestErrorMessage", () => {
  const draft = (type: number, value = "", secondaryValue = "") => ({ type, value, secondaryValue, errorMessage: "", isActive: true }) as never;

  it.each([
    [T.NotEmpty, "", "", "String", "Name is required"],
    [T.Regex, "^a$", "", "String", "Name is not in the right format"],
    [T.MinLength, "3", "", "String", "Name must be at least 3 characters"],
    [T.MaxLength, "1", "", "String", "Name must be at most 1 character"],
    [T.LengthRange, "2", "5", "String", "Name must be between 2 and 5 characters"],
    [T.Equal, "Active", "", "Enum", "Name must be Active"],
    [T.NotEqual, "x", "", "String", "Name must not be x"],
    [T.GreaterThan, "100", "", "Float", "Name must be greater than 100"],
    [T.LessThanOrEqual, "9", "", "Int", "Name must be at most 9"],
    [T.Range, "10", "20", "Int", "Name must be between 10 and 20"],
    [T.GreaterThan, "{{Employee.StartDate}}", "", "DateTime", "Name must be after StartDate"],
    [T.LessThan, "2026-01-01T09:00", "", "DateTime", "Name must be before 2026-01-01 09:00"],
    [T.GreaterThanOrEqual, "2026-01-01T09:00", "", "DateTime", "Name must be on or after 2026-01-01 09:00"],
    [T.Reference, "Department", "ItemId", "String", "Name must match an existing Department"],
  ])("type %s with %j / %j on %s reads %j", (type, value, secondary, fieldType, expected) => {
    expect(suggestErrorMessage(draft(type, value, secondary), fieldType, "Employee.Name")).toBe(expected);
  });

  it("waits for the values it needs", () => {
    expect(suggestErrorMessage(draft(T.GreaterThan), "Int", "Age")).toBeNull();
    expect(suggestErrorMessage(draft(T.Range, "1"), "Int", "Age")).toBeNull();
  });
});
