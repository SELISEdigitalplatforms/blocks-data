import { describe, expect, it } from "vitest";
import type { ISchemaFieldValidation } from "../models/data-service";
import { RULE_MESSAGE_FORMATS, RULE_MESSAGES } from "./rule-messages";
import { newConditionRow, type ConditionField } from "./validation-conditions";
import {
  CURRENT_EVALUATION_VERSION,
  VALIDATION_TYPE as T,
  checkRuleDraft,
  draftFromRule,
  formatRuleSummary,
  getAllowedValidationTypes,
  isOlderReference,
  messageLeftToServer,
  ruleFromDraft,
  ruleScope,
  suggestErrorMessage,
  type RuleDraft,
} from "./validation-rules.util";

/** The rules added by the validation and access rules plan (phase 6): types, list values, now, versions, conditions. */

const draft = (patch: Partial<RuleDraft>): RuleDraft => ({ type: T.NotEmpty, value: "", secondaryValue: "", errorMessage: "", isActive: true, ...patch });
const rule = (patch: Partial<ISchemaFieldValidation>): ISchemaFieldValidation => ({ type: T.NotEmpty, value: null, secondaryValue: null, errorMessage: "", isActive: true, ...patch });
const VARIABLES = {
  schemaName: "Customer",
  fields: {
    Country: { type: "String", isArray: false, isObject: false },
    Status: { type: "String", isArray: false, isObject: false },
    StartDate: { type: "DateTime", isArray: false, isObject: false },
  },
};
const CONDITION_FIELDS: ConditionField[] = [{ path: "Country", type: "String", isArray: false }];
const countryIs = (value: string) => ({ combine: "AND" as const, locked: null, rows: [{ ...newConditionRow(CONDITION_FIELDS), value }] });

describe("rule types offered", () => {
  it("adds the new types after today's, so existing fields keep their order", () => {
    expect(getAllowedValidationTypes("String")).toEqual([T.NotEmpty, T.Regex, T.MinLength, T.MaxLength, T.LengthRange, T.Equal, T.NotEqual, T.Reference, T.In, T.NotIn, T.NotExistsIn]);
    expect(getAllowedValidationTypes("Int")).toEqual(expect.arrayContaining([T.In, T.NotIn, T.NotExistsIn]));
    expect(getAllowedValidationTypes("DateTime")).not.toContain(T.In);
    expect(getAllowedValidationTypes("Boolean")).toEqual([T.NotEmpty, T.Equal, T.NotEqual]);
  });

  it("list properties also get the whole-list rules, and keep today's per-item types (G10)", () => {
    const list = getAllowedValidationTypes("String", true);
    expect(list.slice(0, 8)).toEqual(getAllowedValidationTypes("String").slice(0, 8));
    expect(list).toEqual(expect.arrayContaining([T.MinItems, T.MaxItems, T.UniqueItems]));
    expect(getAllowedValidationTypes("String")).not.toContain(T.MinItems);
  });

  it("a list of objects can only be counted, a single object takes no rule", () => {
    expect(getAllowedValidationTypes("OrderItem", true)).toEqual([T.MinItems, T.MaxItems]);
    expect(getAllowedValidationTypes("Address", false)).toEqual([]);
  });

  it("tags list rules by scope (D8)", () => {
    expect(ruleScope(T.MinItems, true)).toBe("list");
    expect(ruleScope(T.MaxLength, true)).toBe("item");
    expect(ruleScope(T.MaxLength, false)).toBeNull();
  });
});

describe("checks for the new types", () => {
  const check = (patch: Partial<RuleDraft>, fieldType = "String") => checkRuleDraft(draft(patch), fieldType, VARIABLES);

  it("is one of: a list without duplicates, of the property's type, at most 500", () => {
    expect(check({ type: T.In, values: [] })).toBe(RULE_MESSAGES.ValuesMustNotBeEmpty);
    expect(check({ type: T.In, values: ["DE", "DE"] })).toBe(RULE_MESSAGE_FORMATS.DuplicateValue("DE"));
    expect(check({ type: T.NotIn, values: ["1", "x"] }, "Int")).toBe(RULE_MESSAGE_FORMATS.ValueDoesNotFit("x", "whole number"));
    expect(check({ type: T.In, values: ["1.5"] }, "Int")).toBe(RULE_MESSAGE_FORMATS.ValueDoesNotFit("1.5", "whole number"));
    expect(check({ type: T.In, values: Array.from({ length: 501 }, (_, i) => `v${i}`) })).toBe(RULE_MESSAGES.TooManyValues);
    expect(check({ type: T.In, values: ["DE", "de"] })).toBeNull();
  });

  it("list counts are whole numbers", () => {
    expect(check({ type: T.MinItems, value: "x" })).toBe(RULE_MESSAGES.CountMustBeWholeNumber);
    expect(check({ type: T.MaxItems, value: "0" })).toBeNull();
    expect(check({ type: T.UniqueItems })).toBeNull();
  });

  it("dates relative to now: well formed, on dates, in comparisons", () => {
    expect(check({ type: T.LessThanOrEqual, value: "{{Now-18y}}" }, "DateTime")).toBeNull();
    expect(check({ type: T.Range, value: "{{Now-1y}}", secondaryValue: "{{Now}}" }, "DateTime")).toBeNull();
    expect(check({ type: T.GreaterThan, value: "{{Now-18w}}" }, "DateTime")).toBe(RULE_MESSAGE_FORMATS.InvalidNow("{{Now-18w}}"));
    expect(check({ type: T.Equal, value: "{{Now}}" }, "DateTime")).toBe(RULE_MESSAGES.NowOnlyForComparisons);
    expect(check({ type: T.Equal, value: "{{Now}}" }, "String")).toBe(RULE_MESSAGES.NowOnlyForDates);
  });

  it("must not exist in: a target, never the rule's own schema", () => {
    expect(check({ type: T.NotExistsIn, value: "" })).toBe(RULE_MESSAGES.TargetSchemaRequired);
    expect(check({ type: T.NotExistsIn, value: "Customer" })).toBe(RULE_MESSAGES.NotExistsInOwnSchema);
    expect(check({ type: T.NotExistsIn, value: "Blocklist", secondaryValue: "Email" })).toBeNull();
  });

  it("a switched-on condition must be complete; a switched-off one is ignored", () => {
    expect(check({ whenOn: true, when: { combine: "AND", rows: [], locked: null } })).toBe("Add a condition, or turn “Only when” off.");
    expect(check({ whenOn: false, when: { combine: "AND", rows: [], locked: null } })).toBeNull();
    expect(check({ whenOn: true, when: countryIs("DE") })).toBeNull();
  });
});

describe("drafts and the rule sent", () => {
  it("keeps a list value as a list while editing", () => {
    expect(draftFromRule(rule({ type: T.In, value: ["Draft", "Submitted"] }))).toEqual(expect.objectContaining({ values: ["Draft", "Submitted"], value: "" }));
  });

  it("sends list values as the property's type, counts as numbers", () => {
    expect(ruleFromDraft(draft({ type: T.In, values: ["1", "2"] }), "Int").value).toEqual([1, 2]);
    expect(ruleFromDraft(draft({ type: T.NotIn, values: ["DE"] }), "String").value).toEqual(["DE"]);
    expect(ruleFromDraft(draft({ type: T.MinItems, value: "3" }), "String").value).toBe(3);
    expect(ruleFromDraft(draft({ type: T.UniqueItems }), "String").value).toBeNull();
    expect(ruleFromDraft(draft({ type: T.LessThan, value: "{{Now-18y}}" }), "DateTime").value).toBe("{{Now-18y}}");
  });

  it("a new rule gets the current version, 2", () => {
    expect(CURRENT_EVALUATION_VERSION).toBe(2);
    expect(ruleFromDraft(draft({ type: T.MaxLength, value: "5" }), "String").evaluationVersion).toBe(2);
  });

  it("an edited rule keeps its version, raised only as far as the edit needs (decision 5, R4)", () => {
    const edit = (saved: ISchemaFieldValidation, patch: Partial<RuleDraft>, type: string) => ruleFromDraft({ ...draftFromRule(saved), ...patch }, type).evaluationVersion;
    const old = rule({ type: T.GreaterThan, value: 5, evaluationVersion: 0 });
    expect(edit(old, { value: "6" }, "Int")).toBe(0);
    expect(edit(old, { value: "{{Customer.Age}}" }, "Int")).toBe(1);
    // Saved without a version reads as 0, which the server stores the same way.
    const missing = rule({ type: T.LessThan, value: "2020-01-01T00:00" });
    expect(edit(missing, { value: "2021-01-01T00:00" }, "DateTime")).toBe(0);
    expect(edit(missing, { value: "{{Now}}" }, "DateTime")).toBe(1);
    // A condition or a filter needs no version.
    expect(edit(rule({ evaluationVersion: 0 }), { whenOn: true, when: countryIs("DE") }, "String")).toBe(0);
  });

  it("an older Reference rule moves to the new behaviour only with the button (D2)", () => {
    const old = rule({ type: T.Reference, value: "Region", secondaryValue: "Code", evaluationVersion: 1 });
    expect(isOlderReference(old)).toBe(true);
    expect(ruleFromDraft(draftFromRule(old), "String").evaluationVersion).toBe(1);
    expect(ruleFromDraft({ ...draftFromRule(old), useNewBehaviour: true }, "String").evaluationVersion).toBe(2);
    expect(isOlderReference(rule({ type: T.Reference, evaluationVersion: 2 }))).toBe(false);
    expect(isOlderReference(rule({ type: T.NotExistsIn, evaluationVersion: 0 }))).toBe(false);
  });

  it("sends a condition only when it is on, and a filter only on lookup rules", () => {
    const on = ruleFromDraft(draft({ whenOn: true, when: countryIs("DE") }), "String");
    expect(on.when).toEqual(expect.objectContaining({ logicalOperator: 0, rules: [expect.objectContaining({ leftOperand: "Country", staticValue: "DE" })] }));
    expect("when" in ruleFromDraft(draft({ whenOn: false, when: countryIs("DE") }), "String")).toBe(false);
    expect("targetFilter" in ruleFromDraft(draft({ type: T.MaxLength, value: "3", filterOn: true, targetFilter: countryIs("DE") }), "String")).toBe(false);
    const lookup = ruleFromDraft(draft({ type: T.Reference, value: "Customer", filterOn: true, targetFilter: countryIs("DE") }), "String");
    expect(lookup.targetFilter?.rules).toHaveLength(1);
  });

  it("reads a stored condition back into the draft, switched on", () => {
    const stored = ruleFromDraft(draft({ whenOn: true, when: countryIs("DE") }), "String");
    const read = draftFromRule(stored);
    expect(read.whenOn).toBe(true);
    expect(read.when?.rows[0]).toEqual(expect.objectContaining({ field: "Country", value: "DE" }));
    expect(draftFromRule(rule({})).whenOn).toBe(false);
  });
});

describe("how the new rules read", () => {
  it("summaries", () => {
    expect(formatRuleSummary(rule({ type: T.In, value: ["Draft", "Submitted", "Approved", "Cancelled"] }))).toBe("Draft, Submitted, Approved +1");
    expect(formatRuleSummary(rule({ type: T.NotIn, value: ["N/A"] }))).toBe("N/A");
    expect(formatRuleSummary(rule({ type: T.MinItems, value: 1 }))).toBe("At least 1 item");
    expect(formatRuleSummary(rule({ type: T.MaxItems, value: 10 }))).toBe("At most 10 items");
    expect(formatRuleSummary(rule({ type: T.UniqueItems }))).toBe("No duplicates");
    expect(formatRuleSummary(rule({ type: T.NotExistsIn, value: "Customer", secondaryValue: "Email" }))).toBe("Must not exist in Customer.Email");
    expect(formatRuleSummary(rule({ type: T.LessThanOrEqual, value: "{{Now-18y}}" }))).toBe("≤ now − 18 years");
  });

  it("suggested messages", () => {
    const suggest = (patch: Partial<RuleDraft>, type = "String") => suggestErrorMessage(draft(patch), type, "Order.Status");
    expect(suggest({ type: T.In, values: ["Draft", "Approved"] })).toBe("Status must be one of Draft, Approved");
    expect(suggest({ type: T.NotIn, values: ["N/A"] })).toBe("Status must not be one of N/A");
    expect(suggest({ type: T.MinItems, value: "1" })).toBe("Status must have at least 1 item");
    expect(suggest({ type: T.MaxItems, value: "10" })).toBe("Status must have at most 10 items");
    expect(suggest({ type: T.NotExistsIn, value: "Customer" })).toBe("Status must not match an existing Customer");
  });

  it("suggests no message where the server's own names the detail: the repeated value, the date now stood for (D3, F1)", () => {
    const suggest = (patch: Partial<RuleDraft>) => suggestErrorMessage(draft(patch), "DateTime", "Order.Due");
    expect(suggest({ type: T.UniqueItems })).toBeNull();
    expect(suggest({ type: T.LessThanOrEqual, value: "{{Now-18y}}" })).toBeNull();
    expect(suggest({ type: T.Range, value: "2026-01-01T00:00", secondaryValue: "{{Now+30d}}" })).toBeNull();
    expect(messageLeftToServer(draft({ type: T.UniqueItems }))).toBe("repeated");
    expect(messageLeftToServer(draft({ type: T.GreaterThan, value: "{{Now}}" }))).toBe("date");
    expect(messageLeftToServer(draft({ type: T.GreaterThan, value: "{{Order.Created}}" }))).toBeNull();
  });
});

describe("found in review", () => {
  it("a version-0 rule on a list checks the whole list, as the server does (D8)", () => {
    expect(ruleScope(T.Equal, true, 0)).toBe("list");
    expect(ruleScope(T.Equal, true, 1)).toBe("item");
    expect(ruleScope(T.In, true, 0)).toBe("item");
    expect(ruleScope(T.MinItems, true, 2)).toBe("list");
  });

  it("switching an edited rule to Exists in makes it a new Reference rule, at the current version", () => {
    const saved = draftFromRule(rule({ type: T.Equal, value: "x", evaluationVersion: 1 }));
    expect(ruleFromDraft({ ...saved, type: T.Reference, value: "Customer" }, "String").evaluationVersion).toBe(2);
  });

  it("raises the version only when the edit adds a variable, not for one the rule already held", () => {
    const old = rule({ type: T.Equal, value: "{{X.Y}}", evaluationVersion: 0, errorMessage: "a" });
    expect(ruleFromDraft({ ...draftFromRule(old), errorMessage: "b" }, "String").evaluationVersion).toBe(0);
  });

  it("whole numbers written with a decimal point are whole numbers", () => {
    expect(checkRuleDraft(draft({ type: T.In, values: ["1.0", "2"] }), "Int", VARIABLES)).toBeNull();
    expect(checkRuleDraft(draft({ type: T.In, values: ["1.0", "1"] }), "Int", VARIABLES)).toBe(RULE_MESSAGE_FORMATS.DuplicateValue("1"));
  });

  it("an Enum list may only hold the property's values", () => {
    expect(checkRuleDraft(draft({ type: T.In, values: ["Gone"] }), "Enum", VARIABLES, { fieldPath: "Status", enumValues: ["Open"] })).toBe(
      RULE_MESSAGE_FORMATS.ValueDoesNotFit("Gone", "value of Status"),
    );
  });

  it("a lookup rule can't have a condition, and a rule inside a list of objects can't either", () => {
    expect(checkRuleDraft(draft({ type: T.Reference, value: "Customer", whenOn: true, when: countryIs("DE") }), "String", VARIABLES)).toBe(RULE_MESSAGES.ConditionOnLookup);
    expect(ruleFromDraft(draft({ type: T.Reference, value: "Customer", whenOn: true, when: countryIs("DE") }), "String")).not.toHaveProperty("when");
    const nested = { ...VARIABLES, fields: { ...VARIABLES.fields, Items: { type: "Item", isArray: true, isObject: true }, "Items.Qty": { type: "Int", isArray: false, isObject: false } } };
    expect(checkRuleDraft(draft({ whenOn: true, when: countryIs("DE") }), "Int", nested, { fieldPath: "Items.Qty" })).toBe(RULE_MESSAGES.ConditionInsideList);
  });

  it("a stored empty condition reads as none", () => {
    expect(draftFromRule(rule({ when: { logicalOperator: 0, rules: [], nestedGroups: [] } })).whenOn).toBe(false);
  });
});

