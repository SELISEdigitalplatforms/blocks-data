import { describe, expect, it } from "vitest";
import {
  formatPreviewJson,
  normalizeTemplateFields,
  isReadonlyField,
  getSampleValueFromPreviewType,
  formatNestedObject,
  getSampleValue,
  formatInputAssignments,
  formatSelectionFields,
  buildInsertMutation,
  buildUpdateMutation,
  buildDeleteMutation,
  buildQuery,
  buildTemplateSections,
} from "./graphql-template.utils";
import type { TemplateField } from "@/data-gateway/models/schema-preview.types";

describe("graphql-template.utils", () => {
  describe("formatPreviewJson", () => {
    it("pretty-prints with two-space indentation", () => {
      const payload = { SchemaName: "Product", count: 1 };
      expect(formatPreviewJson(payload)).toBe(JSON.stringify(payload, null, 2));
      expect(formatPreviewJson(payload)).toContain('"SchemaName": "Product"');
    });
  });

  describe("normalizeTemplateFields", () => {
    it("returns [] for non-array input", () => {
      expect(normalizeTemplateFields(undefined)).toEqual([]);
      expect(normalizeTemplateFields("nope" as unknown as TemplateField[])).toEqual([]);
    });

    it("trims names, drops blanks, and de-duplicates by trimmed name", () => {
      const result = normalizeTemplateFields([
        { name: "a" },
        { name: " a " },
        { name: "" },
        { name: "   " },
        { name: "b", type: "Int", isArray: true },
      ]);
      expect(result).toEqual([
        { name: "a", type: undefined, isArray: false },
        { name: "b", type: "Int", isArray: true },
      ]);
    });

    it("ignores fields whose name is not a string", () => {
      expect(normalizeTemplateFields([{ name: 123 as unknown as string }, { name: "ok" }])).toEqual(
        [{ name: "ok", type: undefined, isArray: false }],
      );
    });
  });

  describe("isReadonlyField", () => {
    it("detects readonly system columns", () => {
      expect(isReadonlyField("ItemId")).toBe(true);
      expect(isReadonlyField("CreatedDate")).toBe(true);
      expect(isReadonlyField("title")).toBe(false);
    });
  });

  describe("getSampleValueFromPreviewType", () => {
    it("maps known type names (case-insensitively)", () => {
      expect(getSampleValueFromPreviewType("string")).toBe('"Sample text"');
      expect(getSampleValueFromPreviewType("String")).toBe('"Sample text"');
      expect(getSampleValueFromPreviewType("int")).toBe("1");
      expect(getSampleValueFromPreviewType("boolean")).toBe("true");
      expect(getSampleValueFromPreviewType("datetime")).toBe('"2024-01-01T00:00:00Z"');
    });

    it('falls back to "value" for unknown or non-string values', () => {
      expect(getSampleValueFromPreviewType("mystery")).toBe('"value"');
      expect(getSampleValueFromPreviewType(42)).toBe('"value"');
      expect(getSampleValueFromPreviewType(null)).toBe('"value"');
    });
  });

  describe("formatNestedObject", () => {
    it("formats primitive fields using their type-name value", () => {
      const out = formatNestedObject({ name: "string", age: "int" }, 0);
      expect(out).toBe('name: "Sample text"\nage: 1');
    });

    it("formats arrays of primitives", () => {
      expect(formatNestedObject({ tags: ["string"] }, 0)).toBe('tags: ["Sample text"]');
    });

    it("formats arrays of nested DTOs with [{ ... }]", () => {
      const out = formatNestedObject({ items: [{ id: "int" }] }, 0);
      expect(out).toContain("items: [{");
      expect(out).toContain("id: 1");
      expect(out).toContain("}]");
    });

    it("formats a single nested DTO object", () => {
      const out = formatNestedObject({ addr: { city: "string" } }, 0);
      expect(out).toContain("addr: {");
      expect(out).toContain('city: "Sample text"');
    });
  });

  describe("getSampleValue", () => {
    it("returns a type-based scalar sample without preview data", () => {
      expect(getSampleValue({ name: "title", type: "String" })).toBe('"Sample text"');
      expect(getSampleValue({ name: "n", type: "Int" })).toBe("1");
    });

    it("wraps scalar samples in brackets for array fields", () => {
      expect(getSampleValue({ name: "tags", type: "String", isArray: true })).toBe(
        '["Sample text"]',
      );
    });

    it('falls back to "value" for unknown / missing types', () => {
      expect(getSampleValue({ name: "x", type: "Weird" })).toBe('"value"');
      expect(getSampleValue({ name: "x" })).toBe('"value"');
    });

    it("emits an array-of-DTOs block from preview data", () => {
      const out = getSampleValue({ name: "items" }, { items: [{ id: "int" }] });
      expect(out).toContain("[{");
      expect(out).toContain("id: 1");
    });

    it("emits a single DTO block from preview data", () => {
      const out = getSampleValue({ name: "addr" }, { addr: { city: "string" } });
      expect(out.startsWith("{")).toBe(true);
      expect(out).toContain('city: "Sample text"');
    });
  });

  describe("formatInputAssignments", () => {
    it("returns an empty input body when there are no fields", () => {
      expect(formatInputAssignments([])).toEqual([]);
    });

    it("emits one indented assignment per field", () => {
      expect(formatInputAssignments([{ name: "title", type: "String" }])).toEqual([
        '      title: "Sample text"',
      ]);
    });
  });

  describe("formatSelectionFields", () => {
    it("returns a valid selection when there are no known fields", () => {
      expect(formatSelectionFields([])).toEqual(["      __typename"]);
    });

    it("lists simple fields with indentation", () => {
      expect(formatSelectionFields([{ name: "a" }, { name: "b" }])).toEqual(["      a", "      b"]);
    });

    it("expands nested DTO selections from preview data", () => {
      const lines = formatSelectionFields([{ name: "addr" }], { addr: { city: "string" } });
      expect(lines[0]).toBe("      addr {");
      expect(lines).toContain("            city");
      expect(lines[lines.length - 1]).toBe("      }");
    });

    it("expands arrays of DTOs from preview data", () => {
      const lines = formatSelectionFields([{ name: "items" }], { items: [{ id: "int" }] });
      expect(lines[0]).toBe("      items {");
      expect(lines).toContain("            id");
    });
  });

  describe("mutation / query builders", () => {
    const fields: TemplateField[] = [{ name: "title", type: "String" }];

    it("buildInsertMutation wraps input assignments in an insert mutation", () => {
      const out = buildInsertMutation("Product", fields);
      expect(out).toContain("mutation {");
      expect(out).toContain("insertProduct(");
      expect(out).toContain("input: {");
      expect(out).toContain('title: "Sample text"');
      expect(out).toContain("acknowledged");
      expect(out).toContain("itemId");
    });

    it("buildUpdateMutation includes a mongo filter and input block", () => {
      const out = buildUpdateMutation("Product", fields);
      expect(out).toContain("updateProduct(");
      expect(out).toContain('filter: "{}"');
      expect(out).toContain('title: "Sample text"');
    });

    it("buildDeleteMutation contains a filter but no input block", () => {
      const out = buildDeleteMutation("Product");
      expect(out).toContain("deleteProduct(");
      expect(out).toContain('filter: "{}"');
      expect(out).not.toContain("input:");
    });

    it("buildQuery contains pagination + items selection", () => {
      const out = buildQuery("Products", fields);
      expect(out).toContain("query {");
      expect(out).toContain("getProducts(");
      expect(out).toContain("pageNo: 1");
      expect(out).toContain("pageSize: 10");
      expect(out).toContain("items {");
      expect(out).toContain("title");
    });
  });

  describe("buildTemplateSections", () => {
    it("returns the four CRUD sections in order", () => {
      const sections = buildTemplateSections({
        schemaName: "Product",
        fields: [{ name: "title" }],
        schemaType: 2,
      });
      expect(sections.map((s) => s.title)).toEqual(["Query", "Insert", "Update", "Delete"]);
      expect(sections[0].code).toContain("getProducts(");
      expect(sections[1].code).toContain("insertProduct(");
    });

    it("excludes readonly fields from insert/update when schemaType is an entity (1)", () => {
      const sections = buildTemplateSections({
        schemaName: "Product",
        fields: [
          { name: "ItemId", type: "String" },
          { name: "title", type: "String" },
        ],
        schemaType: 1,
      });
      const insert = sections.find((s) => s.title === "Insert")!;
      const query = sections.find((s) => s.title === "Query")!;
      expect(insert.code).not.toContain("ItemId:");
      expect(insert.code).toContain('title: "Sample text"');
      expect(query.code).toContain("ItemId");
    });

    it("keeps readonly fields for non-entity schema types", () => {
      const sections = buildTemplateSections({
        schemaName: "Product",
        fields: [{ name: "ItemId" }, { name: "title" }],
        schemaType: 2,
      });
      const insert = sections.find((s) => s.title === "Insert")!;
      expect(insert.code).toContain("ItemId");
    });
  });
});
