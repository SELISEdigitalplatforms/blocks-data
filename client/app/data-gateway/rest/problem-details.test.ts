import { describe, expect, it } from "vitest";
import { isProblemMediaType, readProblem } from "./problem-details";

describe("readProblem", () => {
  it("summarises a problem+json body with validation errors", () => {
    const body = JSON.stringify({
      type: "https://example.test/validation",
      title: "Validation failed",
      status: 400,
      code: "validation_failed",
      detail: "One or more fields are invalid.",
      errors: [{ field: "Name", message: "Required", validationType: "Required" }],
      traceId: "t1",
    });
    expect(readProblem("application/problem+json; charset=utf-8", body)).toEqual({
      code: "validation_failed",
      title: "Validation failed",
      detail: "One or more fields are invalid.",
      errors: [{ field: "Name", message: "Required", type: "Required" }],
    });
  });

  it("ignores case in the media type", () => {
    expect(readProblem("Application/Problem+JSON", JSON.stringify({ title: "Bad" }))).toEqual({
      title: "Bad",
      errors: [],
    });
  });

  it("summarises an application/json body with status and title", () => {
    expect(readProblem("application/json", JSON.stringify({ status: 404, title: "Not found" }))).toEqual({
      title: "Not found",
      errors: [],
    });
  });

  it("returns null for application/json without status and title", () => {
    expect(readProblem("application/json", JSON.stringify({ status: 404 }))).toBeNull();
    expect(readProblem("application/json", JSON.stringify({ title: "x" }))).toBeNull();
    expect(readProblem("application/json", JSON.stringify({ status: "404", title: "x" }))).toBeNull();
  });

  it("returns null for plain text, invalid JSON, empty and non-object bodies", () => {
    expect(readProblem("text/plain", "upstream connect error")).toBeNull();
    expect(readProblem("application/problem+json", "{not json")).toBeNull();
    expect(readProblem("application/problem+json", "")).toBeNull();
    expect(readProblem("application/problem+json", "[1,2]")).toBeNull();
    expect(readProblem("application/problem+json", "\"text\"")).toBeNull();
    expect(readProblem("application/problem+json", "null")).toBeNull();
  });

  it("ignores non-string code and detail", () => {
    expect(readProblem("application/problem+json", JSON.stringify({ title: "T", code: 5, detail: {} }))).toEqual({
      title: "T",
      errors: [],
    });
  });

  it("skips error items without a string message and keeps optional parts optional", () => {
    const body = JSON.stringify({
      title: "T",
      errors: [{ field: "A" }, { message: 3 }, null, "x", { message: "Bad" }, { field: 1, message: "M", validationType: 2 }],
    });
    expect(readProblem("application/problem+json", body)).toEqual({
      title: "T",
      errors: [{ message: "Bad" }, { message: "M" }],
    });
  });

  it("falls back to an empty title when a problem+json body has none", () => {
    expect(readProblem("application/problem+json", JSON.stringify({ detail: "d" }))).toEqual({
      title: "",
      detail: "d",
      errors: [],
    });
  });
});

describe("isProblemMediaType", () => {
  it.each([
    "application/problem+json",
    "application/problem+json; charset=utf-8",
    "  Application/Problem+JSON ;charset=utf-8",
  ])("accepts %j", (contentType) => {
    expect(isProblemMediaType(contentType)).toBe(true);
  });

  it.each(["", "application/json", "application/problem+xml", "text/plain; type=application/problem+json"])(
    "rejects %j",
    (contentType) => {
      expect(isProblemMediaType(contentType)).toBe(false);
    },
  );
});
