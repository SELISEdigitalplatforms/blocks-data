import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchemaList } from "../../hooks/use-configuration";
import { useRestSchemas } from "./use-rest-schemas";

vi.mock("../../hooks/use-configuration", () => ({ useSchemaList: vi.fn() }));

type QueryState = { isPending?: boolean; isError?: boolean; refetch?: () => void; items?: unknown[] };

/** Entities are loaded with schemaType 1, DTOs with schemaType 2. */
const mockQueries = (entities: QueryState, dtos: QueryState = {}) =>
  vi.mocked(useSchemaList).mockImplementation(({ schemaType }) => {
    const { isPending = false, isError = false, refetch = vi.fn(), items = [] } = schemaType === 1 ? entities : dtos;
    return {
      isPending,
      isError,
      refetch,
      data: isPending ? undefined : { data: { items } },
    } as unknown as ReturnType<typeof useSchemaList>;
  });

const run = () => renderHook(() => useRestSchemas("t1")).result.current;

beforeEach(() => vi.clearAllMocks());

describe("useRestSchemas", () => {
  it("is not pending once both lists have answered", () => {
    mockQueries({}, {});
    expect(run().isPending).toBe(false);
  });

  it("is pending while the entity list is pending", () => {
    mockQueries({ isPending: true }, {});
    expect(run().isPending).toBe(true);
  });

  it("is pending while the DTO list is pending, even if the entities have answered", () => {
    mockQueries({ items: [{ id: "1", schemaName: "Order" }] }, { isPending: true });
    expect(run().isPending).toBe(true);
  });

  it("exposes the entity list's error state and refetch", () => {
    const refetch = vi.fn();
    mockQueries({ isError: true, refetch }, {});
    const result = run();
    expect(result.isError).toBe(true);
    result.refetch();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("is not an error when only the DTO list fails", () => {
    mockQueries({}, { isError: true });
    expect(run().isError).toBe(false);
  });
});
