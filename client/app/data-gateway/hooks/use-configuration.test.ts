import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GraphQLSchema,
  buildSchema,
  introspectionFromSchema,
} from "graphql";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { HttpError } from "@/lib/http-client";
import { configurationService } from "../services/configuration.service";
import {
  getPolicyDataQueryOptions,
  isSchemaNotFound,
  refreshSchemaLists,
  removeSchemaDetails,
  shouldRetrySchemaDetails,
  useCreatePolicy,
  useCreateSchema,
  useCreateSchemaFieldValidation,
  useDeleteMockData,
  useDeletePolicy,
  useDeleteSchema,
  useDeleteSchemaFieldValidation,
  useExecuteGraphQL,
  useGenerateRegex,
  useGetDataServiceConfiguration,
  useGetMockData,
  useGetPolicyData,
  useGetSchemaFieldValidation,
  useGetUnadaptedChangeLogs,
  useGraphQLIntrospection,
  useImportSchemaFile,
  useRawIntrospectionQuery,
  useSchemaDetails,
  useSchemaExport,
  useSchemaList,
  usePendingSchemaIds,
  useSchemaRollback,
  useSchemasReload,
  useSchemaVariableContext,
  useSchemaVersionHistory,
  useSecurityAndPerformanceSchemaList,
  useSetDataAccess,
  useSetRowColumnPermission,
  useUpdatePolicy,
  useUpdateSchema,
  useUpdateSchemaFieldValidation,
  useUpdateSchemaStructure,
} from "./use-configuration";

const mockGetState = vi.fn(() => ({
  selectedProject: { tenantId: "t1", tenantSlug: "slug1" },
}));
vi.mock("@seliseblocks/genesis-os", () => {
  const useProjectStore = () => mockGetState();
  (useProjectStore as unknown as { getState: () => unknown }).getState = () =>
    mockGetState();
  return { useProjectStore };
});

// use-configuration reads HttpError from here; the real module builds HttpClients at import.
vi.mock("@/lib/http-client", () => mockHttpClientFactory());

vi.mock("../services/configuration.service", () => ({
  configurationService: {
    getDataServiceDetails: vi.fn(),
    reloadSchemas: vi.fn(),
    getSchemaVersionHistory: vi.fn(),
    rollbackSchemaVersion: vi.fn(),
    executeGraphQLOperation: vi.fn(),
    getSchemaList: vi.fn(),
    getSecurityAndPerformanceSchemaList: vi.fn(),
    getSchemaDetails: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    updateSchemaStructure: vi.fn(),
    deleteSchema: vi.fn(),
    setDataAccess: vi.fn(),
    setRowColumnPermissions: vi.fn(),
    getMockData: vi.fn(),
    deleteMockData: vi.fn(),
    getPolicy: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    getUnadaptedChangeLogs: vi.fn(),
    getSchemaFieldValidation: vi.fn(),
    createSchemaFieldValidation: vi.fn(),
    updateSchemaFieldValidation: vi.fn(),
    exportSchema: vi.fn(),
    deleteSchemaFieldValidation: vi.fn(),
    generateRegex: vi.fn(),
    importSchemaFile: vi.fn(),
  },
}));

/** The §6.1 body the server sends with a not-found answer. */
const SCHEMA_NOT_FOUND_BODY = {
  isSuccess: false,
  message: "Schema not found",
  httpStatusCode: 404,
  data: null,
  errors: null,
};
const notFound = () => new HttpError(404, { errors: SCHEMA_NOT_FOUND_BODY as never });

/**
 * A client like the app's (no query-level retry override), with no delay between retries so a
 * retried failure settles at once. The schema-details options bring their own `retry`.
 */
const retryingClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
const wrapperFor = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

// A valid introspection result so buildClientSchema can succeed.
const validIntrospection = introspectionFromSchema(
  buildSchema("type Query { hello: String }"),
);
const introspectionResult = { data: validIntrospection };

describe("use-configuration hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Query hooks ────────────────────────────────────────────────────────────

  describe("useGetDataServiceConfiguration", () => {
    it("skips configuration when the consumer does not need it", () => {
      const { result } = renderHook(() => useGetDataServiceConfiguration({ enabled: false }), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getDataServiceDetails).not.toHaveBeenCalled();
    });
    it("should fetch configuration successfully", async () => {
      const response = { config: { id: "1" } };
      vi.mocked(configurationService.getDataServiceDetails).mockResolvedValue(
        response as never,
      );

      const { result } = renderHook(() => useGetDataServiceConfiguration(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(response);
      expect(configurationService.getDataServiceDetails).toHaveBeenCalled();
    });

    it("should expose the error state when the request fails", async () => {
      vi.mocked(configurationService.getDataServiceDetails).mockRejectedValue(
        new Error("boom"),
      );

      const { result } = renderHook(() => useGetDataServiceConfiguration(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useSchemaList", () => {
    it("should fetch the schema list with normalized params", async () => {
      const response = { data: { items: [] } };
      vi.mocked(configurationService.getSchemaList).mockResolvedValue(
        response as never,
      );

      const { result } = renderHook(
        () => useSchemaList({ projectKey: "pk" } as never),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.getSchemaList).toHaveBeenCalledWith({
        keyword: "",
        pageNo: 1,
        pageSize: 10,
        sortDescending: true,
        sortBy: "CreatedDate",
        projectKey: "pk",
        schemaType: "",
      });
    });
  });

  describe("useSecurityAndPerformanceSchemaList", () => {
    it("should fetch the aggregation list", async () => {
      vi.mocked(
        configurationService.getSecurityAndPerformanceSchemaList,
      ).mockResolvedValue({ data: { items: [] } } as never);

      const { result } = renderHook(
        () => useSecurityAndPerformanceSchemaList({ projectKey: "pk" } as never),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        configurationService.getSecurityAndPerformanceSchemaList,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: "pk", pageNo: 1, pageSize: 10 }),
      );
    });
  });

  describe("useSchemaDetails", () => {
    it("should fetch schema details when id and projectKey are present", async () => {
      const response = { data: { schemaName: "User" } };
      vi.mocked(configurationService.getSchemaDetails).mockResolvedValue(
        response as never,
      );

      const { result } = renderHook(() => useSchemaDetails("s1", "pk"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(response);
      expect(configurationService.getSchemaDetails).toHaveBeenCalledWith("s1", "pk");
    });

    it("should stay disabled when id is missing", () => {
      const { result } = renderHook(() => useSchemaDetails("", "pk"), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getSchemaDetails).not.toHaveBeenCalled();
    });

    it("should stay disabled when options.enabled is false", () => {
      const { result } = renderHook(
        () => useSchemaDetails("s1", "pk", { enabled: false }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getSchemaDetails).not.toHaveBeenCalled();
    });

    // C6: a 4xx is final (one request per mount); a 5xx or a failed request is retried once, as today.
    it.each([
      ["a 404", 1, () => notFound()],
      ["a 400", 1, () => new HttpError(400, { errors: { message: "INVALID_SCHEMA_ID" } })],
      ["a 403", 1, () => new HttpError(403, { errors: {} })],
      ["a 500", 2, () => new HttpError(500, { errors: {} })],
      ["a non-HTTP error", 2, () => new TypeError("Failed to fetch")],
    ])("asks for the schema once more only after a 5xx or a failed request: %s means %i request(s)", async (_label, calls, makeError) => {
      vi.mocked(configurationService.getSchemaDetails).mockRejectedValue(makeError());

      const { result } = renderHook(() => useSchemaDetails("gone", "pk"), {
        wrapper: wrapperFor(retryingClient()),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(configurationService.getSchemaDetails).toHaveBeenCalledTimes(calls);
    });

    it("exposes a 404 as a not-found error", async () => {
      vi.mocked(configurationService.getSchemaDetails).mockRejectedValue(notFound());

      const { result } = renderHook(() => useSchemaDetails("gone", "pk"), {
        wrapper: wrapperFor(retryingClient()),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(isSchemaNotFound(result.current.error)).toBe(true);
    });
  });

  describe("isSchemaNotFound", () => {
    it("is true only for an HttpError with status 404", () => {
      expect(isSchemaNotFound(notFound())).toBe(true);
      expect(isSchemaNotFound(new HttpError(400, { errors: {} }))).toBe(false);
      expect(isSchemaNotFound(new HttpError(500, { errors: {} }))).toBe(false);
      expect(isSchemaNotFound(Object.assign(new Error("x"), { status: 404 }))).toBe(false);
      expect(isSchemaNotFound(null)).toBe(false);
      expect(isSchemaNotFound(undefined)).toBe(false);
    });
  });

  describe("shouldRetrySchemaDetails", () => {
    it("never retries a 4xx", () => {
      for (const status of [400, 401, 403, 404, 409, 499]) {
        expect(shouldRetrySchemaDetails(0, new HttpError(status, { errors: {} }))).toBe(false);
      }
    });

    it("retries anything else once", () => {
      for (const error of [new HttpError(500, { errors: {} }), new HttpError(503, { errors: {} }), new Error("network")]) {
        expect(shouldRetrySchemaDetails(0, error)).toBe(true);
        expect(shouldRetrySchemaDetails(1, error)).toBe(false);
      }
    });
  });

  describe("useSchemaVariableContext", () => {
    it("asks a 404 once, like the other schema-details readers (C15)", async () => {
      vi.mocked(configurationService.getSchemaDetails).mockRejectedValue(notFound());
      const queryClient = retryingClient();

      renderHook(() => useSchemaVariableContext("gone", "pk"), { wrapper: wrapperFor(queryClient) });

      await waitFor(() => expect(queryClient.getQueryState(["schema-details", "gone", "pk"])?.status).toBe("error"));
      expect(configurationService.getSchemaDetails).toHaveBeenCalledTimes(1);
    });

    it("retries a 500 once (C15)", async () => {
      vi.mocked(configurationService.getSchemaDetails).mockRejectedValue(new HttpError(500, { errors: {} }));
      const queryClient = retryingClient();

      renderHook(() => useSchemaVariableContext("s1", "pk"), { wrapper: wrapperFor(queryClient) });

      await waitFor(() => expect(queryClient.getQueryState(["schema-details", "s1", "pk"])?.status).toBe("error"));
      expect(configurationService.getSchemaDetails).toHaveBeenCalledTimes(2);
    });

    it("keeps reusing fresh details for a minute on the next mount (C15)", async () => {
      vi.mocked(configurationService.getSchemaDetails).mockResolvedValue({
        data: { schemaName: "Employee", fields: [] },
      } as never);
      const queryClient = retryingClient();

      const first = renderHook(() => useSchemaVariableContext("s1", "pk"), { wrapper: wrapperFor(queryClient) });
      await waitFor(() => expect(first.result.current.schemaName).toBe("Employee"));
      first.unmount();
      const second = renderHook(() => useSchemaVariableContext("s1", "pk"), { wrapper: wrapperFor(queryClient) });

      expect(second.result.current.schemaName).toBe("Employee");
      expect(configurationService.getSchemaDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe("removeSchemaDetails and refreshSchemaLists", () => {
    it("removeSchemaDetails drops only that schema's details for that project", () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(["schema-details", "s1", "pk"], { data: {} });
      queryClient.setQueryData(["schema-details", "s2", "pk"], { data: {} });
      queryClient.setQueryData(["schema-details", "s1", "other"], { data: {} });

      removeSchemaDetails(queryClient, "s1", "pk");

      expect(queryClient.getQueryState(["schema-details", "s1", "pk"])).toBeUndefined();
      expect(queryClient.getQueryData(["schema-details", "s2", "pk"])).toBeDefined();
      expect(queryClient.getQueryData(["schema-details", "s1", "other"])).toBeDefined();
    });

    it("refreshSchemaLists invalidates the schema lists, change logs and security list of the project", () => {
      const queryClient = new QueryClient();
      const listKey = ["schema-list", "", 1, 10, true, "", "pk", ""];
      const otherProjectListKey = ["schema-list", "", 1, 10, true, "", "other", ""];
      for (const key of [listKey, otherProjectListKey, ["unadapted-change-logs", "pk"], ["security-performance-schema-list", "pk"], ["schema-details", "s1", "pk"]]) {
        queryClient.setQueryData(key, {});
      }

      refreshSchemaLists(queryClient, "pk");

      expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(["unadapted-change-logs", "pk"])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(["security-performance-schema-list", "pk"])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(otherProjectListKey)?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(["schema-details", "s1", "pk"])?.isInvalidated).toBe(false);
    });
  });

  describe("useGetMockData", () => {
    it("should fetch mock data", async () => {
      vi.mocked(configurationService.getMockData).mockResolvedValue({
        data: [],
      } as never);

      const { result } = renderHook(() => useGetMockData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.getMockData).toHaveBeenCalled();
    });
  });

  describe("useGetPolicyData", () => {
    it("should fetch policy data when entityName and projectKey are present", async () => {
      const response = { data: {} };
      vi.mocked(configurationService.getPolicy).mockResolvedValue(
        response as never,
      );

      const { result } = renderHook(
        () => useGetPolicyData({ entityName: "User", projectKey: "pk" }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.getPolicy).toHaveBeenCalledWith("User", "pk");
    });

    it("should stay disabled when entityName is missing", () => {
      const { result } = renderHook(
        () => useGetPolicyData({ entityName: "", projectKey: "pk" }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getPolicy).not.toHaveBeenCalled();
    });
  });

  describe("getPolicyDataQueryOptions", () => {
    it("should build the query key and stale time", () => {
      const options = getPolicyDataQueryOptions("User", "pk");
      expect(options.queryKey).toEqual(["get-policy-data", "User", "pk"]);
      expect(options.staleTime).toBe(2 * 60 * 1000);
      expect(typeof options.queryFn).toBe("function");
    });
  });

  describe("useGetUnadaptedChangeLogs", () => {
    it("should fetch the change logs", async () => {
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockResolvedValue({
        data: [],
      } as never);

      const { result } = renderHook(
        () => useGetUnadaptedChangeLogs({ projectKey: "pk" }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.getUnadaptedChangeLogs).toHaveBeenCalledWith({
        projectKey: "pk",
      });
    });
  });

  describe("usePendingSchemaIds", () => {
    it("collects the schemas that have pending changes, once each", async () => {
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockResolvedValue({
        data: [
          { changeType: 1, schemaId: "a" },
          { changeType: 2, schemaId: "a" },
          { changeType: 3, schemaId: "b" },
          { changeType: 4 },
        ],
      } as never);

      const { result } = renderHook(() => usePendingSchemaIds("pk"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.size).toBe(2));
      expect([...result.current]).toEqual(["a", "b"]);
    });
  });

  describe("useGetSchemaFieldValidation", () => {
    it("should fetch when schemaId, fieldName and projectKey are present", async () => {
      vi.mocked(configurationService.getSchemaFieldValidation).mockResolvedValue({
        data: {},
      } as never);

      const option = { schemaId: "s1", fieldName: "email", projectKey: "pk" };
      const { result } = renderHook(() => useGetSchemaFieldValidation(option), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.getSchemaFieldValidation).toHaveBeenCalledWith(
        option,
      );
    });

    it("should stay disabled when fieldName is missing", () => {
      const { result } = renderHook(
        () =>
          useGetSchemaFieldValidation({
            schemaId: "s1",
            fieldName: "",
            projectKey: "pk",
          }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(
        configurationService.getSchemaFieldValidation,
      ).not.toHaveBeenCalled();
    });
  });

  describe("useGraphQLIntrospection", () => {
    it("should build a GraphQLSchema from the introspection result", async () => {
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(
        introspectionResult,
      );

      const { result } = renderHook(
        () => useGraphQLIntrospection({ projectShortKey: "slug1" }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeInstanceOf(GraphQLSchema);
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalled();
    });

    it("should stay disabled without a projectShortKey", () => {
      const { result } = renderHook(
        () => useGraphQLIntrospection({ projectShortKey: "" }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
    });

    it("should expose the error state when introspection fails", async () => {
      vi.mocked(configurationService.executeGraphQLOperation).mockRejectedValue(
        new Error("gateway down"),
      );

      const { result } = renderHook(
        () => useGraphQLIntrospection({ projectShortKey: "slug1" }),
        { wrapper: createWrapper() },
      );

      // This hook overrides the wrapper default with retry: 1, so the error
      // state surfaces only after the retry delay — allow extra time.
      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 5000,
      });
    });
  });

  describe("useRawIntrospectionQuery", () => {
    it("should return the raw introspection JSON", async () => {
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(
        introspectionResult,
      );

      const { result } = renderHook(
        () => useRawIntrospectionQuery({ projectKey: "slug1" }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(introspectionResult);
    });
  });

  // ─── Mutation hooks: method-by-reference (called with variables + context) ───

  describe("method-by-reference mutations", () => {
    const byRefCases: Array<{
      name: string;
      hook: () => { mutate: (v: unknown) => void; isSuccess: boolean };
      method: keyof typeof configurationService;
      payload: unknown;
    }> = [
      {
        name: "useCreateSchema",
        hook: useCreateSchema,
        method: "createSchema",
        payload: { schemaName: "User" },
      },
      {
        name: "useUpdateSchema",
        hook: useUpdateSchema,
        method: "updateSchema",
        payload: { schemaName: "User", itemId: "s1" },
      },
      {
        name: "useUpdateSchemaStructure",
        hook: useUpdateSchemaStructure,
        method: "updateSchemaStructure",
        payload: { schemaDefinitionItemId: "s1", fields: [] },
      },
      {
        name: "useSetDataAccess",
        hook: function useSetDataAccessForS1() {
          return useSetDataAccess("s1");
        },
        method: "setDataAccess",
        payload: { schemaName: "User" },
      },
      {
        name: "useSetRowColumnPermission",
        hook: function useSetRowColumnPermissionForS1() {
          return useSetRowColumnPermission("s1");
        },
        method: "setRowColumnPermissions",
        payload: { schemaName: "User" },
      },
      {
        name: "useCreatePolicy",
        hook: useCreatePolicy,
        method: "createPolicy",
        payload: { schemaId: "s1" },
      },
      {
        name: "useUpdatePolicy",
        hook: useUpdatePolicy,
        method: "updatePolicy",
        payload: { schemaId: "s1" },
      },
      {
        name: "useImportSchemaFile",
        hook: function useImportSchemaFileForTest() {
          return useImportSchemaFile({} as never);
        },
        method: "importSchemaFile",
        payload: { fileName: "schema.json" },
      },
    ];

    byRefCases.forEach(({ name, hook, method, payload }) => {
      it(`${name} should call ${String(method)} with (payload, context)`, async () => {
        vi.mocked(configurationService[method] as never).mockResolvedValue(
          { isSuccess: true } as never,
        );

        const { result } = renderHook(hook, { wrapper: createWrapper() });

        result.current.mutate(payload);
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(configurationService[method]).toHaveBeenCalledWith(
          payload,
          expect.anything(),
        );
      });
    });

    it("useCreateSchema should surface mutation errors", async () => {
      vi.mocked(configurationService.createSchema).mockRejectedValue(
        new Error("create failed"),
      );

      const { result } = renderHook(() => useCreateSchema(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ schemaName: "User" } as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ─── Mutation hooks: wrapped (called with variables only) ────────────────────

  describe("useSchemasReload", () => {
    it("should reload schemas and refresh introspection on settle", async () => {
      vi.mocked(configurationService.reloadSchemas).mockResolvedValue({
        isSuccess: true,
      } as never);
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(
        introspectionResult,
      );

      const { result } = renderHook(() => useSchemasReload(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(undefined as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.reloadSchemas).toHaveBeenCalled();
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalled();
    });

    // A refused publish leaves the gateway unchanged, so the cached schema stays.
    it("should not re-read the schema when the publish fails", async () => {
      vi.mocked(configurationService.reloadSchemas).mockRejectedValue(
        new Error("does not build"),
      );

      const { result } = renderHook(() => useSchemasReload(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(undefined as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
    });
  });

  describe("useSchemaVersionHistory", () => {
    it("stays idle until history is requested", () => {
      const { result } = renderHook(() => useSchemaVersionHistory({ projectKey: "pk", enabled: false }), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getSchemaVersionHistory).not.toHaveBeenCalled();
    });
    it("should read the version history for the project", async () => {
      vi.mocked(configurationService.getSchemaVersionHistory).mockResolvedValue({
        isSuccess: true,
        errors: null,
        data: { currentVersion: 2, versions: [] },
      });

      const { result } = renderHook(() => useSchemaVersionHistory({ projectKey: "pk" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.data?.currentVersion).toBe(2);
    });

    it("should stay disabled without a project", () => {
      const { result } = renderHook(() => useSchemaVersionHistory({ projectKey: "" }), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(configurationService.getSchemaVersionHistory).not.toHaveBeenCalled();
    });
  });

  describe("useSchemaRollback", () => {
    it("should roll back and re-read the served schema", async () => {
      vi.mocked(configurationService.rollbackSchemaVersion).mockResolvedValue({
        isSuccess: true,
        message: "Version 3 is live.",
        errors: null,
        data: { version: 3, previousVersion: 5 },
      });
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(
        introspectionResult,
      );

      const { result } = renderHook(() => useSchemaRollback(), { wrapper: createWrapper() });

      result.current.mutate(3);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.rollbackSchemaVersion).toHaveBeenCalledWith(3);
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalled();
    });

    it("should re-read the pending changes, which the rollback reopens", async () => {
      vi.mocked(configurationService.rollbackSchemaVersion).mockResolvedValue({
        isSuccess: true,
        message: "Version 1 is live.",
        errors: null,
        data: { version: 1, previousVersion: 3 },
      });
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(
        introspectionResult,
      );
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockResolvedValue({ data: [] } as never);

      const { result } = renderHook(
        () => ({
          rollback: useSchemaRollback(),
          // The selected project's key, which the rollback refreshes.
          changeLogs: useGetUnadaptedChangeLogs({ projectKey: "t1" }),
        }),
        { wrapper: createWrapper() },
      );
      await waitFor(() => expect(result.current.changeLogs.isSuccess).toBe(true));
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockClear();

      result.current.rollback.mutate(1);

      await waitFor(() => expect(result.current.rollback.isSuccess).toBe(true));
      expect(configurationService.getUnadaptedChangeLogs).toHaveBeenCalled();
    });

    it("should not re-read the schema when the rollback fails", async () => {
      vi.mocked(configurationService.rollbackSchemaVersion).mockRejectedValue(new Error("404"));

      const { result } = renderHook(() => useSchemaRollback(), { wrapper: createWrapper() });

      result.current.mutate(9);
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
    });
  });

  describe("useUpdateSchemaStructure", () => {
    // Saving a structure is a draft; only Publish makes it live.
    it("should not publish after saving", async () => {
      vi.mocked(configurationService.updateSchemaStructure).mockResolvedValue({
        isSuccess: true,
      } as never);

      const { result } = renderHook(() => useUpdateSchemaStructure(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ schemaDefinitionItemId: "s1", fields: [] } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.reloadSchemas).not.toHaveBeenCalled();
    });
  });

  describe("useDeleteSchema", () => {
    it("should call deleteSchema with only the payload", async () => {
      vi.mocked(configurationService.deleteSchema).mockResolvedValue({
        isSuccess: true,
      } as never);
      const payload = { id: "s1", projectKey: "pk" };

      const { result } = renderHook(() => useDeleteSchema(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.deleteSchema).toHaveBeenCalledWith(payload);
    });

    // The caller removes the deleted schema's details once the page has let go of its id (A8, C9).
    it("leaves the deleted schema's details to the caller and refreshes the lists", async () => {
      vi.mocked(configurationService.deleteSchema).mockResolvedValue({ isSuccess: true } as never);
      const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const removeQueries = vi.spyOn(queryClient, "removeQueries");
      queryClient.setQueryData(["schema-details", "s1", "t1"], { data: {} });
      queryClient.setQueryData(["unadapted-change-logs", "t1"], {});
      queryClient.setQueryData(["security-performance-schema-list", "t1"], {});

      const { result } = renderHook(() => useDeleteSchema(), { wrapper: wrapperFor(queryClient) });
      await act(() => result.current.mutateAsync({ id: "s1", projectKey: "t1" }));

      expect(removeQueries).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(["schema-details", "s1", "t1"])).toBeDefined();
      expect(queryClient.getQueryState(["unadapted-change-logs", "t1"])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(["security-performance-schema-list", "t1"])?.isInvalidated).toBe(true);
    });

    it("should surface delete errors", async () => {
      vi.mocked(configurationService.deleteSchema).mockRejectedValue(
        new Error("delete failed"),
      );

      const { result } = renderHook(() => useDeleteSchema(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "s1", projectKey: "pk" });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useExecuteGraphQL", () => {
    it("should call executeGraphQLOperation with the query string", async () => {
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue({
        data: {},
      });

      const { result } = renderHook(() => useExecuteGraphQL(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ query: "{ me }" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledWith(
        "{ me }",
      );
    });
  });

  describe("useDeleteMockData", () => {
    it("should call deleteMockData with only the payload", async () => {
      vi.mocked(configurationService.deleteMockData).mockResolvedValue({
        isSuccess: true,
      } as never);
      const payload = { schemaName: "User" } as never;

      const { result } = renderHook(() => useDeleteMockData(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.deleteMockData).toHaveBeenCalledWith(payload);
    });
  });

  describe("useDeletePolicy", () => {
    it("should call deletePolicy with only the payload", async () => {
      vi.mocked(configurationService.deletePolicy).mockResolvedValue({
        isSuccess: true,
      } as never);
      const payload = { itemId: "p1" } as never;

      const { result } = renderHook(() => useDeletePolicy(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.deletePolicy).toHaveBeenCalledWith(payload);
    });
  });

  describe("useCreateSchemaFieldValidation", () => {
    it("should call createSchemaFieldValidation with only the payload", async () => {
      vi.mocked(
        configurationService.createSchemaFieldValidation,
      ).mockResolvedValue({ isSuccess: true } as never);
      const payload = {
        schemaId: "s1",
        fieldName: "email",
        projectKey: "pk",
      } as never;

      const { result } = renderHook(() => useCreateSchemaFieldValidation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        configurationService.createSchemaFieldValidation,
      ).toHaveBeenCalledWith(payload);
    });
  });

  describe("useDeleteSchemaFieldValidation", () => {
    it("should call deleteSchemaFieldValidation with the id and projectKey only", async () => {
      vi.mocked(
        configurationService.deleteSchemaFieldValidation,
      ).mockResolvedValue({ isSuccess: true } as never);

      const { result } = renderHook(() => useDeleteSchemaFieldValidation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "v1",
        projectKey: "pk",
        schemaId: "s1",
        fieldName: "email",
      } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        configurationService.deleteSchemaFieldValidation,
      ).toHaveBeenCalledWith({ id: "v1", projectKey: "pk" });
    });
  });

  describe("useUpdateSchemaFieldValidation", () => {
    it("should call updateSchemaFieldValidation with only the payload", async () => {
      vi.mocked(
        configurationService.updateSchemaFieldValidation,
      ).mockResolvedValue({ isSuccess: true } as never);
      const payload = {
        schemaId: "s1",
        fieldName: "email",
        projectKey: "pk",
      } as never;

      const { result } = renderHook(() => useUpdateSchemaFieldValidation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        configurationService.updateSchemaFieldValidation,
      ).toHaveBeenCalledWith(payload);
    });
  });

  describe("useGenerateRegex", () => {
    it("should call generateRegex with only the payload", async () => {
      vi.mocked(configurationService.generateRegex).mockResolvedValue({
        pattern: ".*",
      } as never);
      const payload = { description: "email" };

      const { result } = renderHook(() => useGenerateRegex(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.generateRegex).toHaveBeenCalledWith(payload);
      expect(result.current.data).toEqual({ pattern: ".*" });
    });
  });

  describe("useSchemaExport", () => {
    it("should call exportSchema with only the payload", async () => {
      vi.mocked(configurationService.exportSchema).mockResolvedValue({
        url: "x",
      } as never);
      const payload = { schemaIds: ["s1"] } as never;

      const { result } = renderHook(() => useSchemaExport(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(configurationService.exportSchema).toHaveBeenCalledWith(payload);
    });
  });
});
