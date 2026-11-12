import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ISchemaDetails } from "../models/data-service";
import { EVERYTHING_EXPANDED } from "../utils/nested-tree.util";
import { OPERATION_ACCESS_SCHEMA } from "../utils/schema-structure.utils";

const getSchemaDetails = vi.hoisted(() => vi.fn());
vi.mock("../services/configuration.service", () => ({ configurationService: { getSchemaDetails } }));
vi.mock("@seliseblocks/genesis-os", async () => {
  const { mockHttpClientFactory } = await import("@/test-utils/__mocks__/mock-http-client");
  return { HttpClient: class {}, HttpError: mockHttpClientFactory().HttpError };
});

import { HttpError } from "@seliseblocks/genesis-os";
import { useNestedTree } from "./use-nested-tree";

const address = { id: "addr", schemaName: "Address", fields: [] } as unknown as ISchemaDetails;
const geo = { id: "geo", schemaName: "Geo", fields: [] } as unknown as ISchemaDetails;

const SCHEMA_NOT_FOUND_BODY = { isSuccess: false, message: "Schema not found", httpStatusCode: 404, data: null, errors: null };

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

  it("shows one unavailable row for a child that answers 404, asks once, and still loads its siblings (H7, C12)", async () => {
    getSchemaDetails.mockReset();
    // One client for the whole test: re-rendering must not start from an empty cache.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stableWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    getSchemaDetails.mockImplementation((id: string) =>
      id === "addr"
        ? Promise.reject(new HttpError(404, { errors: SCHEMA_NOT_FOUND_BODY as never }))
        : Promise.resolve({ data: { fields: [{ name: "Lat", type: "Float", isArray: false }] } }),
    );
    const { result, rerender } = renderHook(
      ({ expansion }) =>
        useNestedTree({
          roots: [
            { path: "Home", field: undefined, childSchema: address },
            { path: "Spot", field: undefined, childSchema: geo },
          ],
          lineage: "Employee",
          expansion,
          schemaItems: [address, geo],
          projectKey: "pk",
        }),
      { wrapper: stableWrapper, initialProps: { expansion: EVERYTHING_EXPANDED } },
    );

    await waitFor(() => expect(result.current.get("Home")?.map((r) => r.kind)).toEqual(["unavailable"]));
    await waitFor(() => expect(result.current.get("Spot")?.map((r) => r.path)).toEqual(["Spot.Lat"]));
    expect(result.current.get("Home")?.[0]).toMatchObject({ path: "Home.(unavailable)", depth: 1, guides: ["end"] });

    expect(getSchemaDetails.mock.calls.filter(([id]) => id === "geo")).toHaveLength(1);
    // The property stays open across re-renders, a refocused tab and a reconnect without asking for the
    // missing schema again (a loaded sibling may refresh on focus, as before).
    rerender({ expansion: { ...EVERYTHING_EXPANDED } });
    rerender({ expansion: { ...EVERYTHING_EXPANDED } });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    focusManager.setFocused(undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.get("Home")?.map((r) => r.kind)).toEqual(["unavailable"]);
    expect(getSchemaDetails.mock.calls.filter(([id]) => id === "addr")).toHaveLength(1);
  });

  it("keeps the loading row for errors other than 404", async () => {
    getSchemaDetails.mockReset();
    getSchemaDetails.mockRejectedValue(new HttpError(500, { errors: {} }));
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const settledWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useNestedTree({
          roots: [{ path: "Home", field: undefined, childSchema: address }],
          lineage: "Employee",
          expansion: EVERYTHING_EXPANDED,
          schemaItems: [address],
          projectKey: "pk",
        }),
      { wrapper: settledWrapper },
    );

    // Wait for the 500 to settle (after its one retry) before checking the row.
    await waitFor(() => expect(client.getQueryState(["schema-details", "addr", "pk"])?.status).toBe("error"));
    expect(getSchemaDetails).toHaveBeenCalledTimes(2);
    expect(result.current.get("Home")?.map((r) => r.kind)).toEqual(["loading"]);
  });
});
