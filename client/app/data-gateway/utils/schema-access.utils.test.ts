import { describe, expect, it } from "vitest";
import {
  isNonEmptyString,
  uniqueStrings,
  filterNonEmptyStrings,
  sanitizeRuleSet,
  createEmptyAccessRuleSet,
  normalizeAccessRuleSet,
} from "./schema-access.utils";

describe("schema-access.utils", () => {
  describe("isNonEmptyString", () => {
    it("is true only for non-blank strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString("  x  ")).toBe(true);
    });

    it("is false for blank, null and undefined", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString("   ")).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe("uniqueStrings", () => {
    it("trims, drops empties, and de-duplicates", () => {
      expect(uniqueStrings(["a", " a ", "b", "", "  ", null, undefined, "b"])).toEqual(["a", "b"]);
    });

    it("returns an empty array when nothing is valid", () => {
      expect(uniqueStrings([null, undefined, "  "])).toEqual([]);
    });

    it("filterNonEmptyStrings is an alias of uniqueStrings", () => {
      expect(filterNonEmptyStrings).toBe(uniqueStrings);
      expect(filterNonEmptyStrings([" x ", "x"])).toEqual(["x"]);
    });
  });

  describe("createEmptyAccessRuleSet", () => {
    it("returns a fresh empty rule set", () => {
      expect(createEmptyAccessRuleSet()).toEqual({ roles: [], permissions: [], users: [] });
      // Each call returns a distinct object (not a shared reference).
      expect(createEmptyAccessRuleSet()).not.toBe(createEmptyAccessRuleSet());
    });
  });

  describe("sanitizeRuleSet", () => {
    it("de-duplicates and trims each list", () => {
      expect(
        sanitizeRuleSet({
          roles: ["admin", " admin ", "user"],
          permissions: ["p1", "p1"],
          users: [" u1 "],
        }),
      ).toEqual({ roles: ["admin", "user"], permissions: ["p1"], users: ["u1"] });
    });

    it("defaults missing rule set to empty lists", () => {
      expect(sanitizeRuleSet(undefined)).toEqual({ roles: [], permissions: [], users: [] });
    });
  });

  describe("normalizeAccessRuleSet", () => {
    it("normalizes DTO with null lists into empty arrays", () => {
      expect(
        normalizeAccessRuleSet({ roles: null, permissions: null, users: null }),
      ).toEqual({ roles: [], permissions: [], users: [] });
    });

    it("trims and de-duplicates provided values", () => {
      expect(
        normalizeAccessRuleSet({ roles: ["a", "a", " b "], permissions: [""], users: null }),
      ).toEqual({ roles: ["a", "b"], permissions: [], users: [] });
    });

    it("handles null / undefined access entirely", () => {
      expect(normalizeAccessRuleSet(null)).toEqual({ roles: [], permissions: [], users: [] });
      expect(normalizeAccessRuleSet(undefined)).toEqual({ roles: [], permissions: [], users: [] });
    });
  });
});
