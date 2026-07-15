import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchemaList } from "./use-configuration";
import { useDtoPreviewMap } from "./use-dto-preview-map";

vi.mock("./use-configuration", () => ({
  useSchemaList: vi.fn(),
}));

const mockSchemaList = (items: unknown[]) => {
  vi.mocked(useSchemaList).mockReturnValue({
    data: { data: { items } },
  } as never);
};

// schemaType === 2 marks a DTO; everything else is filtered out.
const DTO = 2;
const ENTITY = 1;

describe("useDtoPreviewMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose empty schema items and map when there is no data", () => {
    vi.mocked(useSchemaList).mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.schemaItems).toEqual([]);
    expect(result.current.dtoPreviewMap.size).toBe(0);
    expect(result.current.searchText).toBe("");
    expect(typeof result.current.setSearchText).toBe("function");
    expect(typeof result.current.debouncedSetSearchText).toBe("function");
  });

  it("should only keep DTO schemas (schemaType === 2)", () => {
    mockSchemaList([
      { schemaName: "AddressDto", schemaType: DTO, fields: [] },
      { schemaName: "User", schemaType: ENTITY, fields: [] },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.schemaItems.map((i) => i.schemaName)).toEqual([
      "AddressDto",
    ]);
  });

  it("should build a preview map with primitive field types", () => {
    mockSchemaList([
      {
        schemaName: "AddressDto",
        schemaType: DTO,
        fields: [
          { name: "street", type: "String" },
          { name: "zip", type: "Int" },
        ],
      },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.dtoPreviewMap.get("AddressDto")).toEqual({
      street: "string",
      zip: "integer",
    });
  });

  it("should resolve nested DTO references recursively", () => {
    mockSchemaList([
      {
        schemaName: "AddressDto",
        schemaType: DTO,
        fields: [{ name: "street", type: "String" }],
      },
      {
        schemaName: "PersonDto",
        schemaType: DTO,
        fields: [
          { name: "fullName", type: "String" },
          { name: "home", type: "AddressDto" },
        ],
      },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.dtoPreviewMap.get("PersonDto")).toEqual({
      fullName: "string",
      home: { street: "string" },
    });
  });

  it("should wrap array DTO fields in an array", () => {
    mockSchemaList([
      {
        schemaName: "AddressDto",
        schemaType: DTO,
        fields: [{ name: "street", type: "String" }],
      },
      {
        schemaName: "PersonDto",
        schemaType: DTO,
        fields: [{ name: "homes", type: "AddressDto", isArray: true }],
      },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.dtoPreviewMap.get("PersonDto")).toEqual({
      homes: [{ street: "string" }],
    });
  });

  it("should not overflow on circular DTO references", () => {
    mockSchemaList([
      {
        schemaName: "A",
        schemaType: DTO,
        fields: [{ name: "toB", type: "B" }],
      },
      {
        schemaName: "B",
        schemaType: DTO,
        fields: [{ name: "toA", type: "A" }],
      },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    // Circular reference resolves to the primitive fallback rather than looping.
    const a = result.current.dtoPreviewMap.get("A");
    expect(a).toBeDefined();
    expect(a).toHaveProperty("toB");
  });

  it("should skip fields with no name", () => {
    mockSchemaList([
      {
        schemaName: "AddressDto",
        schemaType: DTO,
        fields: [{ name: "", type: "String" }, { name: "city", type: "String" }],
      },
    ]);

    const { result } = renderHook(() => useDtoPreviewMap("pk"));

    expect(result.current.dtoPreviewMap.get("AddressDto")).toEqual({
      city: "string",
    });
  });
});
