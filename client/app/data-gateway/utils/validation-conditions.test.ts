import { describe, expect, it } from "vitest";
import type { IPolicyRule, IPolicyRuleGroup } from "../models/data-service";
import { RULE_MESSAGE_FORMATS, RULE_MESSAGES } from "./rule-messages";
import {
  conditionDraftError,
  conditionDraftFrom,
  conditionGroupFrom,
  conditionGroupText,
  conditionRowError,
  conditionRowText,
  fittingProperties,
  newConditionRow,
  operatorLabel,
  operatorsFor,
  type ConditionField,
  type ConditionRow,
} from "./validation-conditions";

const FIELDS: ConditionField[] = [
  { path: "Country", type: "String", isArray: false },
  { path: "BillingCountry", type: "String", isArray: false },
  { path: "Type", type: "Enum", isArray: false, enumValues: ["Business", "Private"] },
  { path: "Revenue", type: "Float", isArray: false },
  { path: "Limit", type: "Float", isArray: false },
  { path: "Founded", type: "DateTime", isArray: false },
  { path: "IsVerified", type: "Boolean", isArray: false },
  { path: "ItemId", type: "String", isArray: false },
];

const rule = (patch: Partial<IPolicyRule>): IPolicyRule => ({
  leftSource: 1,
  leftOperand: "Country",
  operator: 0,
  rightSource: 2,
  rightOperand: "",
  staticValue: "DE",
  ...patch,
});
const group = (rules: IPolicyRule[], logicalOperator = 0, nestedGroups: IPolicyRuleGroup[] = []): IPolicyRuleGroup => ({ logicalOperator, rules, nestedGroups });
const row = (patch: Partial<ConditionRow>): ConditionRow => ({ ...newConditionRow(FIELDS), ...patch });

describe("conditions: stored ↔ editor, without losing anything", () => {
  it("no stored condition is no draft", () => {
    expect(conditionDraftFrom(null)).toBeNull();
    expect(conditionDraftFrom(undefined)).toBeNull();
  });

  it("an untouched condition goes back exactly as received, description and list included", () => {
    const stored = group([rule({ description: "German customers" }), rule({ leftOperand: "Type", operator: 8, staticValue: ["Business", "Private"] })]);
    expect(conditionGroupFrom(conditionDraftFrom(stored)!)).toEqual(stored);
  });

  it("an edited row is rebuilt: fixed values as text, a list as comma-separated text, as the policy editor sends them", () => {
    const draft = conditionDraftFrom(group([rule({})]))!;
    draft.rows[0] = { ...draft.rows[0], operator: "IN", value: "DE, AT" };
    expect(conditionGroupFrom(draft).rules[0]).toEqual(
      expect.objectContaining({ leftSource: 1, leftOperand: "Country", operator: 8, rightSource: 2, staticValue: "DE,AT" }),
    );
  });

  it("a comparison with another property is kept as one", () => {
    const stored = group([rule({ operator: 3, leftOperand: "Revenue", rightSource: 1, rightOperand: "Limit", staticValue: null })]);
    const draft = conditionDraftFrom(stored)!;
    expect(draft.rows[0]).toEqual(expect.objectContaining({ field: "Revenue", operator: "GREATER_THAN_OR_EQUAL", mode: "property", other: "Limit" }));
    draft.rows[0] = { ...draft.rows[0], other: "Revenue" };
    expect(conditionGroupFrom(draft).rules[0]).toEqual(expect.objectContaining({ rightSource: 1, rightOperand: "Revenue", staticValue: null }));
  });

  it("a stored list in rightOperands reads as the row's values, and goes back unchanged", () => {
    const stored = group([rule({ operator: 8, staticValue: null, rightOperands: ["DE", "AT"] })]);
    const draft = conditionDraftFrom(stored)!;
    expect(draft.rows[0].value).toBe("DE, AT");
    expect(conditionGroupFrom(draft)).toEqual(stored);
  });

  it("all match / any matches is the group's logical operator", () => {
    const draft = conditionDraftFrom(group([rule({}), rule({ leftOperand: "Type", staticValue: "Business" })], 1))!;
    expect(draft.combine).toBe("OR");
    expect(conditionGroupFrom({ ...draft, combine: "AND" }).logicalOperator).toBe(0);
  });

  it.each([
    ["nested groups", group([rule({})], 0, [group([rule({})])])],
    ["an Auth value", group([rule({ rightSource: 0, rightOperand: "userId" })])],
    ["an unknown operator", group([rule({ operator: 99 })])],
    ["a fixed value on the left", group([rule({ leftSource: 2 })])],
  ])("a condition with %s is shown read-only and saved back unchanged (D7)", (_name, stored) => {
    const draft = conditionDraftFrom(stored)!;
    expect(draft.locked).toBe(stored);
    expect(conditionGroupFrom({ ...draft, combine: "OR" })).toBe(stored);
  });
});

describe("conditions: operators per type, from the policy editor's lists", () => {
  const ops = (path: string) => operatorsFor(FIELDS.find((f) => f.path === path)!);

  it("each kind of property gets its own operators", () => {
    expect(ops("Country")).toEqual(["EQUAL", "NOT_EQUAL", "IN", "NOT_IN", "START_WITH", "END_WITH", "IS_NULL", "IS_NOT_NULL"]);
    expect(ops("Type")).toEqual(["EQUAL", "NOT_EQUAL", "IN", "NOT_IN", "IS_NULL", "IS_NOT_NULL"]);
    expect(ops("Founded")).not.toContain("IN");
    expect(ops("IsVerified")).toEqual(["EQUAL", "NOT_EQUAL", "IS_NULL", "IS_NOT_NULL"]);
  });

  it("dates read as before / after", () => {
    expect(operatorLabel("GREATER_THAN", "DateTime")).toBe("is after");
    expect(operatorLabel("LESS_THAN_OR_EQUAL", "DateTime")).toBe("on or before");
    expect(operatorLabel("EQUAL", "Boolean")).toBe("is");
    expect(operatorLabel("IN", "String")).toBe("is one of");
    expect(operatorLabel("IS_NULL", "String")).toBe("is empty");
  });

  it("another property is offered only of the same kind, never the row's own or ItemId (D5)", () => {
    expect(fittingProperties(row({ field: "Country", operator: "EQUAL" }), FIELDS)).toEqual(["BillingCountry", "Type"]);
    expect(fittingProperties(row({ field: "Revenue", operator: "GREATER_THAN" }), FIELDS)).toEqual(["Limit"]);
    expect(fittingProperties(row({ field: "Country", operator: "IN" }), FIELDS)).toEqual([]);
  });
});

describe("conditions: errors on each row (D6)", () => {
  const error = (patch: Partial<ConditionRow>) => conditionRowError(row(patch), FIELDS);

  it("each kind asks for what it needs", () => {
    expect(error({ field: "Country", operator: "EQUAL", value: "" })).toBe(RULE_MESSAGES.ConditionNeedsValue);
    expect(error({ field: "Country", operator: "EQUAL", value: "Smith, John" })).toBe(RULE_MESSAGES.CommaInSingleValue);
    expect(error({ field: "Country", operator: "EQUAL", value: "{{Auth.UserId}}" })).toBe(RULE_MESSAGES.PlaceholderNotAllowed);
    expect(error({ field: "Country", operator: "EQUAL", value: "a}}b" })).toBeNull();   // the server refuses only "{{"
    expect(error({ field: "Country", operator: "IN", value: " , " })).toBe("Enter one or more values, separated by commas");
    expect(error({ field: "Revenue", operator: "GREATER_THAN", value: "ten" })).toBe("Enter a number");
    expect(error({ field: "Founded", operator: "GREATER_THAN", value: "" })).toBe("Pick a date and time");
    expect(error({ field: "Type", operator: "IN", value: "" })).toBe("Pick at least one value");
    expect(error({ field: "IsVerified", operator: "EQUAL", value: "" })).toBe("Pick a value");
    expect(error({ field: "Revenue", operator: "GREATER_THAN", mode: "property", other: "" })).toBe("Pick the property to compare with");
    expect(error({ field: "Gone", operator: "EQUAL", value: "x" })).toBe(RULE_MESSAGE_FORMATS.UnknownProperty("Gone"));
  });

  it("empty checks need no value", () => {
    expect(error({ field: "Country", operator: "IS_NULL", value: "" })).toBeNull();
  });

  it("a switched-on condition needs a row", () => {
    expect(conditionDraftError({ combine: "AND", rows: [], locked: null }, FIELDS, "when")).toBe("Add a condition, or turn “Only when” off.");
    expect(conditionDraftError({ combine: "AND", rows: [], locked: null }, FIELDS, "filter")).toBe("Add a condition, or turn the filter off.");
  });
});

describe("conditions: how they read (D4)", () => {
  const text = (patch: Partial<ConditionRow>) => conditionRowText(row(patch), FIELDS);

  it("text in quotes, properties, numbers, dates, true/false and lists without", () => {
    expect(text({ field: "Country", operator: "EQUAL", value: "DE" })).toBe('Country = "DE"');
    expect(text({ field: "Country", operator: "EQUAL", mode: "property", other: "BillingCountry" })).toBe("Country = BillingCountry");
    expect(text({ field: "Revenue", operator: "GREATER_THAN_OR_EQUAL", value: "100" })).toBe("Revenue ≥ 100");
    expect(text({ field: "Founded", operator: "LESS_THAN", value: "2020-01-01T00:00:00Z" })).toBe("Founded is before 2020-01-01 00:00 UTC");
    expect(text({ field: "IsVerified", operator: "EQUAL", value: "true" })).toBe("IsVerified is true");
    expect(text({ field: "Type", operator: "IN", value: "Business, Private" })).toBe("Type is one of Business, Private");
    expect(text({ field: "Country", operator: "IS_NOT_NULL" })).toBe("Country is not empty");
    expect(text({ field: "Country", operator: "START_WITH", value: "D" })).toBe('Country starts with "D"');
  });

  it("a stored group reads in full, nested groups in brackets", () => {
    const stored = group(
      [rule({ leftOperand: "Type", staticValue: "Business" })],
      0,
      [group([rule({}), rule({ staticValue: "AT" })], 1)],
    );
    expect(conditionGroupText(stored, FIELDS)).toBe('Type = "Business" and (Country = "DE" or Country = "AT")');
  });
});
