import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSchemaPreview } from "./use-schema-preview";
import { PropertyRow } from "../models/schema-structure.types";

const makeProperty = (overrides: Partial<PropertyRow>): PropertyRow => ({
  name: "field",
  type: "String",
  isArray: false,
  ...overrides,
});

describe("useSchemaPreview", () => {
  it("should map primitive property types to preview values", () => {
    const properties = [
      makeProperty({ name: "title", type: "String" }),
      makeProperty({ name: "count", type: "Int" }),
      makeProperty({ name: "active", type: "Boolean" }),
    ];
    const { result } = renderHook(() =>
      useSchemaPreview(properties, new Map()),
    );

    expect(result.current.previewData).toEqual({
      title: "string",
      count: "integer",
      active: "boolean",
    });
  });

  it("should wrap array primitive types in an array", () => {
    const properties = [makeProperty({ name: "tags", type: "String", isArray: true })];
    const { result } = renderHook(() =>
      useSchemaPreview(properties, new Map()),
    );

    expect(result.current.previewData).toEqual({ tags: ["string"] });
  });

  it("should resolve DTO types from the preview map", () => {
    const dtoMap = new Map<string, Record<string, unknown>>([
      ["Address", { street: "string", zip: "integer" }],
    ]);
    const properties = [makeProperty({ name: "home", type: "Address" })];

    const { result } = renderHook(() => useSchemaPreview(properties, dtoMap));

    expect(result.current.previewData).toEqual({
      home: { street: "string", zip: "integer" },
    });
  });

  it("should wrap array-of-DTO types and deep-clone them", () => {
    const nested = { street: "string" };
    const dtoMap = new Map<string, Record<string, unknown>>([["Address", nested]]);
    const properties = [makeProperty({ name: "homes", type: "Address", isArray: true })];

    const { result } = renderHook(() => useSchemaPreview(properties, dtoMap));

    expect(result.current.previewData).toEqual({ homes: [{ street: "string" }] });
    // Deep clone: mutating the source map must not affect the produced preview.
    (nested as Record<string, unknown>).street = "mutated";
    expect(
      (result.current.previewData.homes as Array<Record<string, unknown>>)[0]
        .street,
    ).toBe("string");
  });

  it("should skip properties without a name", () => {
    const properties = [
      makeProperty({ name: "", type: "String" }),
      makeProperty({ name: "  ", type: "Int" }),
      makeProperty({ name: "kept", type: "String" }),
    ];
    const { result } = renderHook(() =>
      useSchemaPreview(properties, new Map()),
    );

    expect(result.current.previewData).toEqual({ kept: "string" });
  });

  it("should handle a non-array properties argument gracefully", () => {
    const { result } = renderHook(() =>
      useSchemaPreview(null as never, new Map()),
    );

    expect(result.current.previewData).toEqual({});
    expect(result.current.templateFields).toEqual([]);
  });

  it("should build templateFields from properties with normalized booleans", () => {
    const properties = [
      makeProperty({
        name: "email",
        type: "String",
        isArray: false,
        isPIIData: true,
        isUniqueData: true,
      }),
    ];
    const { result } = renderHook(() =>
      useSchemaPreview(properties, new Map()),
    );

    expect(result.current.templateFields).toEqual([
      {
        name: "email",
        type: "String",
        isArray: false,
        isPIIData: true,
        isUniqueData: true,
      },
    ]);
  });
});
