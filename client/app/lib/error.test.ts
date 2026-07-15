import { describe, expect, it } from "vitest";
import { getErrorMessage, isErrorWithErrors, handleErrorMessages } from "./error";

describe("getErrorMessage", () => {
  it("returns a fallback for empty/undefined error", () => {
    expect(getErrorMessage({} as never)).toBe("Something went wrong.");
    expect(getErrorMessage(undefined as never)).toBe("Something went wrong.");
  });

  it("prefers the mapped message when present", () => {
    expect(getErrorMessage({ email: "bad" }, { email: "Custom" })).toEqual([
      "Custom",
    ]);
  });

  it("uses string values and joins array values", () => {
    expect(getErrorMessage({ a: "one", b: ["x", "y"] })).toEqual([
      "one",
      "x, y",
    ]);
  });

  it("falls back when no usable messages produced", () => {
    expect(getErrorMessage({ a: [] as string[] })).toBe("Something went wrong.");
  });
});

describe("isErrorWithErrors", () => {
  it("is true for an object with an errors object", () => {
    expect(isErrorWithErrors({ errors: { a: "b" } })).toBe(true);
  });

  it("is false for non-objects or missing errors", () => {
    expect(isErrorWithErrors(null)).toBe(false);
    expect(isErrorWithErrors("x")).toBe(false);
    expect(isErrorWithErrors({ message: "x" })).toBe(false);
  });
});

describe("handleErrorMessages", () => {
  it("returns strings as-is", () => {
    expect(handleErrorMessages("boom")).toBe("boom");
  });

  it("filters arrays to string members", () => {
    expect(handleErrorMessages(["a", 2, "b"])).toEqual(["a", "b"]);
    expect(handleErrorMessages([1, 2])).toBe("An unexpected error occurred.");
  });

  it("delegates objects to getErrorMessage", () => {
    expect(handleErrorMessages({ a: "one" })).toEqual(["one"]);
  });

  it("falls back for unsupported types", () => {
    expect(handleErrorMessages(42)).toBe("An unexpected error occurred.");
  });
});
