import { describe, expect, it } from "vitest";
import {
  displayStaticValue,
  fromDateInput,
  staticValueError,
  staticValueSpec,
  toDateInput,
} from "./rule-static-value";

describe("staticValueSpec", () => {
  it("follows the property's type", () => {
    expect(staticValueSpec("Boolean").kind).toBe("boolean");
    expect(staticValueSpec("DateTime").kind).toBe("date");
    expect(staticValueSpec("Int").kind).toBe("int");
    expect(staticValueSpec("INT64").kind).toBe("int");
    expect(staticValueSpec("Float").kind).toBe("float");
    expect(staticValueSpec("decimal").kind).toBe("float");
    expect(staticValueSpec("String").kind).toBe("text");
    expect(staticValueSpec("Enum", false, ["A", "B"])).toEqual({
      kind: "enum",
      enumValues: ["A", "B"],
    });
  });

  it("keeps lists and an Enum without values as text", () => {
    expect(staticValueSpec("Int", true).kind).toBe("text");
    expect(staticValueSpec("Enum", false, []).kind).toBe("text");
    expect(staticValueSpec(undefined).kind).toBe("text");
  });
});

describe("staticValueError", () => {
  const spec = (type: string, enumValues?: string[]) => staticValueSpec(type, false, enumValues);

  it("accepts values that fit the type", () => {
    expect(staticValueError(spec("Int"), "10", false)).toBeNull();
    expect(staticValueError(spec("Int"), "-3", false)).toBeNull();
    expect(staticValueError(spec("Float"), "150.5", false)).toBeNull();
    expect(staticValueError(spec("Float"), "1e3", false)).toBeNull();
    expect(staticValueError(spec("Boolean"), "true", false)).toBeNull();
    expect(staticValueError(spec("DateTime"), "2025-01-01T09:30:00Z", false)).toBeNull();
    expect(staticValueError(spec("Enum", ["Draft", "Approved"]), "Approved", false)).toBeNull();
    expect(staticValueError(spec("String"), "anything at all", false)).toBeNull();
  });

  it("names what a one-value rule needs", () => {
    expect(staticValueError(spec("Int"), "10.5", false)).toBe("Enter a whole number");
    expect(staticValueError(spec("Float"), "abc", false)).toBe("Enter a number");
    // The server reads numbers in plain decimal form only.
    expect(staticValueError(spec("Float"), "0x10", false)).toBe("Enter a number");
    expect(staticValueError(spec("Boolean"), "yes", false)).toBe("Choose true or false");
    expect(staticValueError(spec("DateTime"), "next week", false)).toBe("Enter a date and time");
    expect(staticValueError(spec("Enum", ["Draft"]), "Gone", false)).toBe(
      "Choose one of the property's values",
    );
  });

  it("checks every item of an In / Not in list", () => {
    expect(staticValueError(spec("Float"), "10, 20.5, 99", true)).toBeNull();
    expect(staticValueError(spec("Float"), "10, abc", true)).toBe(
      "Enter numbers separated by commas",
    );
    expect(staticValueError(spec("Int"), "1,2.5", true)).toBe(
      "Enter whole numbers separated by commas",
    );
    expect(
      staticValueError(spec("Enum", ["Draft", "Approved"]), "Draft,Approved", true),
    ).toBeNull();
    expect(staticValueError(spec("Enum", ["Draft"]), "Draft,Gone", true)).toBe(
      "Choose from the property's values",
    );
  });

  it("leaves an empty value to the required check", () => {
    expect(staticValueError(spec("Int"), "", false)).toBeNull();
  });
});

describe("date values", () => {
  it("shows a stored UTC date in the picker and stores the picker's value as UTC", () => {
    expect(toDateInput("2025-01-01T09:30:00Z")).toBe("2025-01-01T09:30");
    expect(fromDateInput("2025-01-01T09:30")).toBe("2025-01-01T09:30:00Z");
    expect(fromDateInput("")).toBe("");
  });

  it("reads an older date-only value as midnight UTC", () => {
    expect(toDateInput("2025-01-01")).toBe("2025-01-01T00:00");
  });

  it("converts a value with another zone to UTC", () => {
    expect(toDateInput("2025-01-01T09:30:00+06:00")).toBe("2025-01-01T03:30");
  });

  it("labels a date value in UTC and leaves other values as they are", () => {
    expect(displayStaticValue(staticValueSpec("DateTime"), "2025-01-01T09:30:00Z")).toBe(
      "2025-01-01 09:30 UTC",
    );
    expect(displayStaticValue(staticValueSpec("Int"), "10")).toBe("10");
  });
});
