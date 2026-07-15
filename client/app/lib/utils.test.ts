import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  formatDate,
  formatFullDate,
  parseDateString,
  compareDates,
  BREADCRUMB_CUSTOM_TITLES,
  clearBreadCrumbTitleEntry,
  debounce,
  parseMongoDBString,
  checkValidDate,
  deepEqual,
  clearQueryString,
  getUniqueID,
  formatSize,
} from "./utils";

describe("lib/utils", () => {
  describe("cn", () => {
    it("merges class names and dedupes tailwind conflicts", () => {
      expect(cn("p-2", "text-sm")).toContain("p-2");
      // tailwind-merge keeps the last conflicting utility
      expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("handles conditional/falsey values", () => {
      expect(cn("a", false, null, undefined, "b")).toBe("a b");
    });
  });

  describe("formatDate", () => {
    const date = new Date(2023, 0, 5, 9, 7); // 05/01/2023 09:07

    it("formats with time by default", () => {
      expect(formatDate(date)).toBe("05/01/2023, 09:07");
    });

    it("omits time when withoutTime is true", () => {
      expect(formatDate(date, true)).toBe("05/01/2023");
    });
  });

  describe("formatFullDate", () => {
    const date = new Date(2023, 2, 9, 14, 3); // Mar 09, 2023 14:03

    it("formats with month name and time", () => {
      expect(formatFullDate(date)).toBe("Mar 09, 2023 at 14:03");
    });

    it("omits time when withoutTime is true", () => {
      expect(formatFullDate(date, true)).toBe("Mar 09, 2023");
    });
  });

  describe("parseDateString / compareDates", () => {
    it("parses a date string into a Date", () => {
      const d = parseDateString("2023-01-01T00:00:00Z");
      expect(d).toBeInstanceOf(Date);
      expect(d.getTime()).toBe(Date.parse("2023-01-01T00:00:00Z"));
    });

    it("returns negative when A is before B", () => {
      expect(compareDates("2023-01-01", "2023-01-02")).toBeLessThan(0);
    });

    it("returns positive when A is after B", () => {
      expect(compareDates("2023-02-01", "2023-01-01")).toBeGreaterThan(0);
    });

    it("returns zero for equal dates", () => {
      expect(compareDates("2023-01-01", "2023-01-01")).toBe(0);
    });
  });

  describe("clearBreadCrumbTitleEntry", () => {
    it("sets the entry to null", () => {
      BREADCRUMB_CUSTOM_TITLES["/foo"] = "Foo";
      clearBreadCrumbTitleEntry("/foo");
      expect(BREADCRUMB_CUSTOM_TITLES["/foo"]).toBeNull();
    });
  });

  describe("debounce", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("invokes the function only after the delay, with latest args", () => {
      const fn = vi.fn();
      const d = debounce(fn, 200);
      d("a");
      d("b");
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("b");
    });

    it("cancel prevents the pending call", () => {
      const fn = vi.fn();
      const d = debounce(fn, 100);
      d();
      d.cancel();
      vi.advanceTimersByTime(500);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("parseMongoDBString", () => {
    it("unwraps ISODate/ObjectId", () => {
      expect(parseMongoDBString('ObjectId("abc")')).toBe('"abc"');
      expect(parseMongoDBString('ISODate("2023-01-01")')).toBe('"2023-01-01"');
    });

    it("unwraps $date objects and NumberLong", () => {
      expect(parseMongoDBString('{ "$date": "2023-01-01" }')).toBe('"2023-01-01"');
      expect(parseMongoDBString("NumberLong(42)")).toBe("42");
    });
  });

  describe("checkValidDate", () => {
    it("accepts a valid recent date", () => {
      expect(checkValidDate("2023-01-01")).toBe(true);
    });

    it("rejects an invalid date string", () => {
      expect(checkValidDate("not-a-date")).toBe(false);
    });

    it("rejects dates before 1900-01-01", () => {
      expect(checkValidDate("1800-01-01")).toBe(false);
    });
  });

  describe("deepEqual", () => {
    it("returns true for identical primitives and reference equality", () => {
      expect(deepEqual(1, 1)).toBe(true);
      const o = { a: 1 };
      expect(deepEqual(o, o)).toBe(true);
    });

    it("compares nested objects structurally", () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    });

    it("returns false for differing key sets", () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it("returns false when one side is null or not an object", () => {
      expect(deepEqual({ a: 1 }, null)).toBe(false);
      expect(deepEqual(null, { a: 1 })).toBe(false);
      expect(deepEqual({ a: 1 }, 5)).toBe(false);
    });
  });

  describe("clearQueryString", () => {
    beforeEach(() => {
      window.history.replaceState(null, "", "/page?a=1&b=2&c=3");
    });

    it("removes all query params by default", () => {
      clearQueryString();
      expect(window.location.search).toBe("");
    });

    it("keeps only the excepted params that exist", () => {
      clearQueryString({ except: ["b", "missing"] });
      const params = new URLSearchParams(window.location.search);
      expect(params.get("b")).toBe("2");
      expect(params.get("a")).toBeNull();
      expect(params.get("missing")).toBeNull();
    });
  });

  describe("getUniqueID", () => {
    it("returns an id with the BLK- prefix and 6 uppercase letters", () => {
      const id = getUniqueID();
      expect(id).toMatch(/^BLK-\d+-[A-Z]{6}$/);
    });

    it("returns different ids across calls", () => {
      expect(getUniqueID()).not.toBe(getUniqueID());
    });
  });

  describe("formatSize", () => {
    it("formats bytes and scales up units", () => {
      expect(formatSize(0)).toBe("0 B");
      expect(formatSize(1024)).toBe("1 KB");
      expect(formatSize(1024 * 1024)).toBe("1 MB");
    });

    it("honors the input unit", () => {
      expect(formatSize(1, "GB")).toBe("1 GB");
      expect(formatSize(1024, "MB")).toBe("1 GB");
    });

    it("respects the decimals argument", () => {
      expect(formatSize(1536, "B", 1)).toBe("1.5 KB");
    });
  });
});
