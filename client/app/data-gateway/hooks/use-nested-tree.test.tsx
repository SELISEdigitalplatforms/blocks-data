import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ISchemaDetails } from "../models/data-service";
import { EVERYTHING_EXPANDED } from "../utils/nested-tree.util";
import { OPERATION_ACCESS_SCHEMA } from "../utils/schema-structure.utils";

const getSchemaDetails = vi.hoisted(() => vi.fn());
vi.mock("../services/configuration.service", () => ({ configurationService: { getSchemaDetails } }));
vi.mock("@seliseblocks/genesis-os", () => ({ HttpClient: class {} }));

import { useNestedTree } from "./use-nested-tree";

const address = { id: "addr", schemaName: "Address", fields: [] } as unknown as ISchemaDetails;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useNestedTree", () => {
  it("loads an open object's fields, showing a loading row until they arrive", async () => {
    getSchemaDetails.mockResolvedValue({ data: { fields: [{ name: "City", type: "String", isArray: false }] } });
    const { result } = renderHook(
      () =>
        useNestedTree({
          roots: [{ path: "Home", field: undefined, childSchema: address }],
          lineage: "Employee",
          expansion: EVERYTHING_EXPANDED,
          schemaItems: [address],
          projectKey: "pk",
        }),
      { wrapper },
    );

    expect(result.current.get("Home")?.[0].kind).toBe("loading");
    await waitFor(() => expect(result.current.get("Home")?.map((r) => r.path)).toEqual(["Home.City"]));
    expect(getSchemaDetails).toHaveBeenCalledWith("addr", "pk");
  });

  it("builds OperationAccess's fixed lists without a request", () => {
    getSchemaDetails.mockClear();
    const { result } = renderHook(
      () =>
        useNestedTree({
          roots: [{ path: "Create", field: undefined, childSchema: OPERATION_ACCESS_SCHEMA }],
          lineage: "Employee",
          expansion: EVERYTHING_EXPANDED,
          schemaItems: [],
          projectKey: "pk",
        }),
      { wrapper },
    );

    expect(result.current.get("Create")?.map((r) => r.path)).toEqual(["Create.Roles", "Create.UserIds", "Create.Permissions"]);
    expect(getSchemaDetails).not.toHaveBeenCalled();
  });
});
