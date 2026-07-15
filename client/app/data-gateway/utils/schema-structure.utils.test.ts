import { describe, expect, it } from "vitest";
import { findChildSchemaByType, getPreviewFieldType } from "./schema-structure.utils";
import type { ISchemaDetails } from "@/data-gateway/models/data-service";

const schema = (schemaName: string): ISchemaDetails =>
  ({ schemaName }) as ISchemaDetails;

describe("schema-structure.utils", () => {
  describe("findChildSchemaByType", () => {
    const items = [schema("Product"), schema("Order"), schema("Customer")];

    it("matches case-insensitively and ignoring surrounding whitespace", () => {
      expect(findChildSchemaByType(items, "product")).toBe(items[0]);
      expect(findChildSchemaByType(items, "  ORDER  ")).toBe(items[1]);
    });

    it("returns undefined when nothing matches", () => {
      expect(findChildSchemaByType(items, "Unknown")).toBeUndefined();
    });

    it("returns undefined for an undefined type", () => {
      expect(findChildSchemaByType(items, undefined)).toBeUndefined();
    });

    it("returns undefined for an empty item list", () => {
      expect(findChildSchemaByType([], "Product")).toBeUndefined();
    });
  });

  describe("getPreviewFieldType", () => {
    it("returns empty string for missing type", () => {
      expect(getPreviewFieldType()).toBe("");
      expect(getPreviewFieldType(undefined)).toBe("");
    });

    it("maps known types via PREVIEW_TYPE_MAP", () => {
      expect(getPreviewFieldType("String")).toBe("string");
      expect(getPreviewFieldType("Int")).toBe("integer");
      expect(getPreviewFieldType("Long")).toBe("long");
      expect(getPreviewFieldType("DateTime")).toBe("datetime");
    });

    it("trims input before mapping", () => {
      expect(getPreviewFieldType("  Boolean  ")).toBe("boolean");
    });

    it("lower-cases unknown types as a fallback", () => {
      expect(getPreviewFieldType("CustomType")).toBe("customtype");
      expect(getPreviewFieldType(" MyDto ")).toBe("mydto");
    });
  });
});
