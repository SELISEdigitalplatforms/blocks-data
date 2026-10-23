import { describe, expect, it } from "vitest";
import {
  allowedDefaultKinds,
  canHaveDefault,
  checkDefaultDraft,
  defaultFromDraft,
  describeNow,
  draftFromDefault,
  draftKind,
  emptyDefaultDraft,
  formatDefaultSummary,
  type DefaultTarget,
} from "./default-value.util";

const target = (fieldType: string, isArray = false, enumValues: string[] = []): DefaultTarget => ({
  fieldType,
  isArray,
  enumValues,
  schemaName: "Employee",
  fields: {
    FirstName: { type: "String", isArray: false, isObject: false },
    LastName: { type: "String", isArray: false, isObject: false },
  },
});

/** A draft as the one value box leaves it; "Now" stands for picking the current date & time. */
const draft = (entered: "typed" | "Now", items: string[], days = "0") => ({
  ...emptyDefaultDraft(),
  items,
  useNow: entered === "Now",
  offset: { days, hours: "0", minutes: "0", seconds: "0" },
});

describe("which properties and kinds", () => {
  it("locks the platform's own five properties and non-scalar types", () => {
    expect(canHaveDefault("CreatedDate", "DateTime")).toBe(false);
    expect(canHaveDefault("ItemId", "String")).toBe(false);
    expect(canHaveDefault("Tags", "String")).toBe(true);
    expect(canHaveDefault("Location", "GeoJson")).toBe(false);
  });

  it("offers templates on text and Now on a single date-time", () => {
    expect(allowedDefaultKinds("String", false)).toEqual(["Static", "Template"]);
    expect(allowedDefaultKinds("DateTime", false)).toEqual(["Static", "Now"]);
    expect(allowedDefaultKinds("DateTime", true)).toEqual(["Static"]);
    expect(allowedDefaultKinds("Int", false)).toEqual(["Static"]);
  });
});

describe("the kind sent to the API follows from what was entered", () => {
  it("is an expression once text holds a variable, fixed otherwise", () => {
    expect(draftKind(draft("typed", ["Hello"]), target("String"))).toBe("Static");
    expect(draftKind(draft("typed", ["Dr. {{Employee.LastName}}"]), target("String"))).toBe("Template");
    // A half-typed variable counts too, so its syntax error shows.
    expect(draftKind(draft("typed", ["{{Employee.First"]), target("String"))).toBe("Template");
    // Only one row of a list needs one.
    expect(draftKind(draft("typed", ["admin", "{{Auth.UserId}}"]), target("String", true))).toBe("Template");
  });

  it("is Now when the current date & time is picked, and never an expression off text types", () => {
    expect(draftKind(draft("Now", [""]), target("DateTime"))).toBe("Now");
    expect(draftKind(draft("typed", ["{{x}}"]), target("Int"))).toBe("Static");
  });

  it("opens a saved default in the box it came from", () => {
    expect(draftFromDefault({ kind: "Now", offset: { days: 30, hours: 0, minutes: 0, seconds: 0 } })).toMatchObject({ useNow: true, items: [""] });
    expect(draftFromDefault({ kind: "Template", value: "Hi {{Auth.Email}}" })).toMatchObject({ useNow: false, items: ["Hi {{Auth.Email}}"] });
  });
});

describe("checks before saving (same messages as the server)", () => {
  it.each([
    ["Int", "abc", '"abc" is not a whole number'],
    ["Float", "x", '"x" is not a number'],
    ["Boolean", "maybe", '"maybe" is not true or false'],
    ["DateTime", "2025-13-01", '"2025-13-01" is not a valid date-time'],
  ])("%s %s", (type, value, expected) => {
    expect(checkDefaultDraft(draft("typed", [value]), target(type))).toBe(expected);
  });

  it("checks enum values and template syntax", () => {
    expect(checkDefaultDraft(draft("typed", ["Gold"]), target("Enum", false, ["Silver", "Bronze"]))).toBe(
      '"Gold" is not one of the listed values (Silver, Bronze)',
    );
    expect(checkDefaultDraft(draft("typed", ["{{Employee.FirstName} {{Employee.LastName}}"]), target("String"))).toBe(
      'Unclosed variable at position 1: expected "}}"',
    );
    expect(checkDefaultDraft(draft("typed", ["{{Employee.FirstName}} {{Employee.LastName}}"]), target("String"))).toBeNull();
  });

  it("checks Now and its offset", () => {
    expect(checkDefaultDraft(draft("Now", [""]), target("String"))).toBe("Now can only be used on single date-time properties");
    expect(checkDefaultDraft(draft("Now", [""], "1.5"), target("DateTime"))).toBe("Days must be a whole number");
    expect(checkDefaultDraft(draft("Now", [""], "-30"), target("DateTime"))).toBeNull();
  });
});

describe("payload and summary", () => {
  it("types static values and keeps lists as lists", () => {
    expect(defaultFromDraft(draft("typed", ["5"]), target("Int"))).toEqual({ kind: "Static", value: 5 });
    expect(defaultFromDraft(draft("typed", ["admin", "", "app-user"]), target("String", true))).toEqual({
      kind: "Static",
      value: ["admin", "app-user"],
    });
    expect(defaultFromDraft(draft("Now", [""], "365"), target("DateTime"))).toEqual({
      kind: "Now",
      value: null,
      offset: { days: 365, hours: 0, minutes: 0, seconds: 0 },
    });
  });

  it("round-trips a saved default into the form", () => {
    const saved = { kind: "Template" as const, value: ["{{Auth.UserId}}"] };
    expect(defaultFromDraft(draftFromDefault(saved), target("String", true))).toEqual(saved);
  });

  it("summarises each kind", () => {
    expect(formatDefaultSummary({ kind: "Now", offset: { days: 365, hours: 0, minutes: 0, seconds: 0 } })).toBe(
      "365 days after the record is created",
    );
    expect(formatDefaultSummary({ kind: "Static", value: ["admin", "app-user"] })).toBe('["admin", "app-user"]');
    expect(formatDefaultSummary({ kind: "Template", value: "{{Employee.FirstName}} {{Employee.LastName}}" })).toBe(
      "{{Employee.FirstName}} {{Employee.LastName}}",
    );
  });
});

describe("describeNow", () => {
  it("reads the current date & time and its adjustment as a sentence", () => {
    expect(describeNow(null)).toBe("The date and time the record is created");
    expect(describeNow({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe("The date and time the record is created");
    expect(describeNow({ days: 1, hours: 0, minutes: 0, seconds: 0 })).toBe("1 day after the record is created");
    expect(describeNow({ days: 0, hours: -2, minutes: -30, seconds: 0 })).toBe("2 hours and 30 minutes before the record is created");
    expect(describeNow({ days: 1, hours: 2, minutes: 0, seconds: 5 })).toBe("1 day, 2 hours and 5 seconds after the record is created");
  });

  it("keeps each part's sign when an imported offset mixes them", () => {
    expect(describeNow({ days: -1, hours: 2, minutes: 0, seconds: 0 })).toBe("The date and time the record is created, −1 day +2 hours");
  });
});
