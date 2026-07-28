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

  describe("introspection source", () => {
    const scalar = (name: string) => ({ kind: "SCALAR", name, ofType: null });
    const nn = (ofType: { kind: string; name: string | null; ofType: unknown }) => ({
      kind: "NON_NULL",
      name: null,
      ofType,
    });
    const list = (ofType: { kind: string; name: string | null; ofType: unknown }) => ({
      kind: "LIST",
      name: null,
      ofType,
    });
    const inputField = (name: string, type: { kind: string; name: string | null; ofType: unknown }) => ({
      name,
      description: null,
      type,
      defaultValue: null,
    });
    const buildInputObject = (name: string, inputFields: ReturnType<typeof inputField>[]) => ({
      kind: "INPUT_OBJECT",
      name,
      description: null,
      fields: null,
      inputFields,
      interfaces: null,
      enumValues: null,
      possibleTypes: null,
    });

    const buildIntrospection = (inputTypeName: string, inputFields: ReturnType<typeof inputField>[]) => ({
      data: {
        __schema: {
          queryType: null,
          mutationType: null,
          subscriptionType: null,
          types: [buildInputObject(inputTypeName, inputFields)],
          directives: [],
        },
      },
    });

    it("should use introspection scalar mapping when schemaName matches", () => {
      const introspection = buildIntrospection("User", [
        inputField("email", scalar("String")),
        inputField("age", scalar("Int")),
        inputField("active", scalar("Boolean")),
      ]);
      const properties = [
        makeProperty({ name: "email", type: "String" }),
        makeProperty({ name: "age", type: "Int" }),
        makeProperty({ name: "active", type: "Boolean" }),
      ];
      const { result } = renderHook(() =>
        useSchemaPreview(properties, new Map(), {
          rawIntrospection: introspection,
          schemaName: "User",
        }),
      );

      expect(result.current.previewData).toEqual({
        email: "string",
        age: "integer",
        active: "boolean",
      });
    });

    it("should resolve nested DTO via introspection types", () => {
      const introspection = {
        data: {
          __schema: {
            queryType: null,
            mutationType: null,
            subscriptionType: null,
            types: [
              buildInputObject("User", [
                inputField("home", nn(scalar("Address"))),
              ]),
              buildInputObject("Address", [
                inputField("street", scalar("String")),
                inputField("zip", scalar("Int")),
              ]),
            ],
            directives: [],
          },
        },
      };
      const properties = [makeProperty({ name: "home", type: "Address" })];
      const { result } = renderHook(() =>
        useSchemaPreview(properties, new Map(), {
          rawIntrospection: introspection,
          schemaName: "User",
        }),
      );

      expect(result.current.previewData).toEqual({
        home: { street: "string", zip: "integer" },
      });
    });

    it("should wrap introspection types in arrays when isArray is true", () => {
      const introspection = buildIntrospection("User", [
        inputField("tags", list(scalar("String"))),
      ]);
      const properties = [makeProperty({ name: "tags", type: "String", isArray: true })];
      const { result } = renderHook(() =>
        useSchemaPreview(properties, new Map(), {
          rawIntrospection: introspection,
          schemaName: "User",
        }),
      );

      expect(result.current.previewData).toEqual({ tags: ["string"] });
    });

    it("should fall back to local dtoPreviewMap when schemaName has no introspection type", () => {
      const dtoMap = new Map<string, Record<string, unknown>>([
        ["Address", { street: "string" }],
      ]);
      const introspection = buildIntrospection("User", [
        inputField("email", scalar("String")),
      ]);
      const properties = [makeProperty({ name: "home", type: "Address" })];
      const { result } = renderHook(() =>
        useSchemaPreview(properties, dtoMap, {
          rawIntrospection: introspection,
          schemaName: "SomeOtherSchema",
        }),
      );

      expect(result.current.previewData).toEqual({
        home: { street: "string" },
      });
    });

    it("should not throw when rawIntrospection is undefined", () => {
      const properties = [makeProperty({ name: "title", type: "String" })];
      const { result } = renderHook(() =>
        useSchemaPreview(properties, new Map(), {
          rawIntrospection: undefined,
          schemaName: "User",
        }),
      );

      expect(result.current.previewData).toEqual({ title: "string" });
    });
  });
});
