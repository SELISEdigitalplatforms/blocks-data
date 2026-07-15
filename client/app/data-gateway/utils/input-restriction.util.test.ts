import { describe, expect, it, vi } from "vitest";
import {
  allowOnlyLettersKeyDown,
  allowLettersNumbersUnderscoreKeyDown,
  SCHEMA_NAME_ALLOWED_PATTERN,
  typeOptions,
  readonlyPropertyNames,
} from "./input-restriction.util";

type KeyEvent = Parameters<typeof allowOnlyLettersKeyDown>[0];

const makeEvent = (key: string) => {
  const preventDefault = vi.fn();
  const event = { key, preventDefault } as unknown as KeyEvent;
  return { event, preventDefault };
};

describe("input-restriction.util", () => {
  describe("allowOnlyLettersKeyDown", () => {
    it("allows single letters (upper and lower case)", () => {
      for (const key of ["a", "Z", "m"]) {
        const { event, preventDefault } = makeEvent(key);
        allowOnlyLettersKeyDown(event);
        expect(preventDefault).not.toHaveBeenCalled();
      }
    });

    it("allows navigation / editing control keys", () => {
      for (const key of ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete"]) {
        const { event, preventDefault } = makeEvent(key);
        allowOnlyLettersKeyDown(event);
        expect(preventDefault).not.toHaveBeenCalled();
      }
    });

    it("blocks digits, underscores and symbols", () => {
      for (const key of ["1", "_", "-", " ", "@"]) {
        const { event, preventDefault } = makeEvent(key);
        allowOnlyLettersKeyDown(event);
        expect(preventDefault).toHaveBeenCalledOnce();
      }
    });
  });

  describe("allowLettersNumbersUnderscoreKeyDown", () => {
    it("allows letters, digits and underscore", () => {
      for (const key of ["a", "Z", "3", "_"]) {
        const { event, preventDefault } = makeEvent(key);
        allowLettersNumbersUnderscoreKeyDown(event);
        expect(preventDefault).not.toHaveBeenCalled();
      }
    });

    it("allows control keys", () => {
      const { event, preventDefault } = makeEvent("Backspace");
      allowLettersNumbersUnderscoreKeyDown(event);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it("blocks whitespace and symbols", () => {
      for (const key of ["-", " ", ".", "@"]) {
        const { event, preventDefault } = makeEvent(key);
        allowLettersNumbersUnderscoreKeyDown(event);
        expect(preventDefault).toHaveBeenCalledOnce();
      }
    });
  });

  describe("SCHEMA_NAME_ALLOWED_PATTERN", () => {
    it("accepts names starting with a letter or underscore", () => {
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("Product")).toBe(true);
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("_private")).toBe(true);
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("field_1")).toBe(true);
    });

    it("rejects names starting with a digit or containing invalid chars", () => {
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("1field")).toBe(false);
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("has space")).toBe(false);
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("has-dash")).toBe(false);
      expect(SCHEMA_NAME_ALLOWED_PATTERN.test("")).toBe(false);
    });
  });

  describe("static option lists", () => {
    it("typeOptions expose the supported primitive types", () => {
      expect(typeOptions).toEqual(["String", "Int", "Float", "Boolean", "DateTime"]);
    });

    it("readonlyPropertyNames include system-managed columns", () => {
      expect(readonlyPropertyNames).toContain("ItemId");
      expect(readonlyPropertyNames).toContain("CreatedDate");
      expect(readonlyPropertyNames).toContain("OrganizationId");
      expect(readonlyPropertyNames).not.toContain("name");
    });
  });
});
