import { describe, expect, it } from "vitest";
import { getVisiblePageSizeOptions, isPaginationRedundant } from "./pagination-utils";

describe("getVisiblePageSizeOptions", () => {
  it("keeps sizes up to the first one that fits every row", () => {
    expect(getVisiblePageSizeOptions([10, 50, 100, 200], 30, 10)).toEqual([10, 50]);
    expect(getVisiblePageSizeOptions([10, 50, 100, 200], 150, 10)).toEqual([10, 50, 100, 200]);
  });

  it("keeps only the smallest size when it already fits every row", () => {
    expect(getVisiblePageSizeOptions([5, 10, 20], 1, 5)).toEqual([5]);
  });

  it("always keeps the current page size", () => {
    expect(getVisiblePageSizeOptions([10, 50, 100, 200], 30, 200)).toEqual([10, 50, 200]);
  });

  it("sorts and de-duplicates the options", () => {
    expect(getVisiblePageSizeOptions([20, 5, 10, 10], 100, 10)).toEqual([5, 10, 20]);
  });

  it("returns nothing when no options are given", () => {
    expect(getVisiblePageSizeOptions([], 100, 10)).toEqual([]);
  });
});

describe("isPaginationRedundant", () => {
  it("is redundant on the first page when every row fits and no smaller size exists", () => {
    expect(isPaginationRedundant([10, 50], 10, 10, true)).toBe(true);
    expect(isPaginationRedundant([10, 50], 0, 10, true)).toBe(true);
    expect(isPaginationRedundant([], 4, 5, true)).toBe(true);
  });

  it("is needed when there are more rows than one page", () => {
    expect(isPaginationRedundant([10, 50], 11, 10, true)).toBe(false);
  });

  it("is needed when a smaller page size would split the rows", () => {
    expect(isPaginationRedundant([5, 10, 20], 7, 10, true)).toBe(false);
  });

  it("is needed on a later page so the user can get back", () => {
    expect(isPaginationRedundant([10, 50], 3, 10, false)).toBe(false);
  });
});
