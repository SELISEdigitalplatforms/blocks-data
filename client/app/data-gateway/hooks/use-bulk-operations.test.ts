import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBulkOperations } from "./use-bulk-operations";

type BulkProps = Parameters<typeof useBulkOperations>[0];

const buildProps = (overrides: Partial<BulkProps> = {}): BulkProps => {
  const properties = overrides.properties ?? [
    {
      name: "Alpha",
      type: "String",
      isArray: false,
      readAccess: { roles: ["admin", "admin"], permissions: ["p1"], users: [] },
    },
    { name: "Beta", type: "Int", isArray: false },
    { name: "Gamma", type: "Boolean", isArray: true },
  ];
  const fields =
    overrides.fields ??
    (properties.map((_, i) => ({ id: `f${i + 1}` })) as never);

  return {
    fields,
    properties: properties as never,
    insert: overrides.insert ?? (vi.fn() as never),
    remove: overrides.remove ?? (vi.fn() as never),
    readonlyPropertyNames: overrides.readonlyPropertyNames ?? [],
    schemaType: overrides.schemaType,
  };
};

describe("useBulkOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose the initial empty state", () => {
    const { result } = renderHook(() => useBulkOperations(buildProps()));

    expect(result.current.selectedRows).toEqual({});
    expect(result.current.hasSelectedRows).toBe(false);
    expect(result.current.selectedFieldEntries).toEqual([]);
    expect(result.current.bulkAccessTitle).toBe("Manage access");
    expect(result.current.isBulkAccessDrawerOpen).toBe(false);
    expect(result.current.bulkAccessTargets).toBeNull();
    expect(result.current.selectedFieldNames).toEqual([]);
  });

  it("should reflect selected rows via selectedFieldEntries and hasSelectedRows", () => {
    const { result } = renderHook(() => useBulkOperations(buildProps()));

    act(() => result.current.setSelectedRows({ f1: true, f3: true }));

    expect(result.current.hasSelectedRows).toBe(true);
    expect(result.current.selectedFieldEntries.map((e) => e.index)).toEqual([0, 2]);
  });

  describe("handleBulkDuplicate", () => {
    it("should insert copies (without id) of selected non-readonly fields", () => {
      const insert = vi.fn();
      const { result } = renderHook(() =>
        useBulkOperations(buildProps({ insert: insert as never })),
      );

      act(() => result.current.setSelectedRows({ f1: true }));
      act(() => result.current.handleBulkDuplicate());

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(1, {
        name: "Alpha",
        type: "String",
        isArray: false,
        readAccess: { roles: ["admin", "admin"], permissions: ["p1"], users: [] },
      });
      // Selection is cleared after duplicating.
      expect(result.current.selectedRows).toEqual({});
    });

    it("should skip readonly fields for adapted schemas (schemaType 1)", () => {
      const insert = vi.fn();
      const { result } = renderHook(() =>
        useBulkOperations(
          buildProps({
            insert: insert as never,
            schemaType: 1,
            readonlyPropertyNames: ["Alpha"],
          }),
        ),
      );

      act(() => result.current.setSelectedRows({ f1: true }));
      act(() => result.current.handleBulkDuplicate());

      expect(insert).not.toHaveBeenCalled();
      expect(result.current.selectedRows).toEqual({});
    });

    it("should insert in descending index order to preserve positions", () => {
      const insert = vi.fn();
      const { result } = renderHook(() =>
        useBulkOperations(buildProps({ insert: insert as never })),
      );

      act(() => result.current.setSelectedRows({ f1: true, f2: true }));
      act(() => result.current.handleBulkDuplicate());

      expect(insert.mock.calls.map((c) => c[0])).toEqual([2, 1]);
    });
  });

  describe("handleBulkDelete", () => {
    it("should remove selected indexes in descending order and clear selection", () => {
      const remove = vi.fn();
      const { result } = renderHook(() =>
        useBulkOperations(buildProps({ remove: remove as never })),
      );

      act(() => result.current.setSelectedRows({ f1: true, f3: true }));
      act(() => result.current.handleBulkDelete());

      expect(remove).toHaveBeenCalledWith([2, 0]);
      expect(result.current.selectedRows).toEqual({});
    });

    it("should not call remove when only readonly fields are selected", () => {
      const remove = vi.fn();
      const { result } = renderHook(() =>
        useBulkOperations(
          buildProps({
            remove: remove as never,
            schemaType: 1,
            readonlyPropertyNames: ["Alpha"],
          }),
        ),
      );

      act(() => result.current.setSelectedRows({ f1: true }));
      act(() => result.current.handleBulkDelete());

      expect(remove).not.toHaveBeenCalled();
      expect(result.current.selectedRows).toEqual({});
    });
  });

  describe("handleBulkManageAccess", () => {
    it("should open the drawer with sanitized targets for a single field", () => {
      const { result } = renderHook(() => useBulkOperations(buildProps()));

      act(() => result.current.setSelectedRows({ f1: true }));
      act(() => result.current.handleBulkManageAccess());

      expect(result.current.isBulkAccessDrawerOpen).toBe(true);
      expect(result.current.bulkAccessTitle).toBe("Access for Alpha");
      expect(result.current.selectedFieldNames).toEqual(["Alpha"]);
      expect(result.current.bulkAccessTargets).toEqual([
        {
          name: "Alpha",
          // duplicate "admin" role is de-duplicated by sanitizeRuleSet
          readAccess: { roles: ["admin"], permissions: ["p1"], users: [] },
          writeAccess: undefined,
          deleteAccess: undefined,
        },
      ]);
    });

    it("should title the drawer with the field count for multiple fields", () => {
      const { result } = renderHook(() => useBulkOperations(buildProps()));

      act(() => result.current.setSelectedRows({ f1: true, f2: true }));
      act(() => result.current.handleBulkManageAccess());

      expect(result.current.bulkAccessTitle).toBe("Access for 2 fields");
      expect(result.current.selectedFieldNames).toEqual(["Alpha", "Beta"]);
    });

    it("should do nothing when no rows are selected", () => {
      const { result } = renderHook(() => useBulkOperations(buildProps()));

      act(() => result.current.handleBulkManageAccess());

      expect(result.current.isBulkAccessDrawerOpen).toBe(false);
      expect(result.current.bulkAccessTargets).toBeNull();
    });
  });

  describe("clearSelection", () => {
    it("should reset the selected rows", () => {
      const { result } = renderHook(() => useBulkOperations(buildProps()));

      act(() => result.current.setSelectedRows({ f1: true }));
      expect(result.current.hasSelectedRows).toBe(true);

      act(() => result.current.clearSelection());
      expect(result.current.selectedRows).toEqual({});
      expect(result.current.hasSelectedRows).toBe(false);
    });
  });
});
