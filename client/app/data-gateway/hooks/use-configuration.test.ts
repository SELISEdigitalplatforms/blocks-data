import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphQLSchema,
  buildSchema,
  introspectionFromSchema,
} from "graphql";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { configurationService } from "../services/configuration.service";
import {
  getPolicyDataQueryOptions,
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

  // ─── Introspection caches (blocks-data#422) ─────────────────────────────────
  // Publish and rollback seed both introspection keys with setQueryData, so a seeded entry
  // has no queryFn until a reader mounts on it. Import only queues drafts and must not
  // refetch these keys: a refetch without a queryFn rejects with "Missing queryFn".

  describe("introspection caches across publish, rollback and import", () => {
    const rawKey = ["graphql-raw-introspection", "t1"];
    const builtKey = ["graphql-introspection", "slug1"];
    const introspectionPrefixes = new Set(["graphql-raw-introspection", "graphql-introspection"]);
    const worldIntrospectionResult = {
      data: introspectionFromSchema(buildSchema("type Query { hello: String world: String }")),
    };
    const selectProject = (tenantId: string, tenantSlug: string) =>
      mockGetState.mockImplementation(() => ({ selectedProject: { tenantId, tenantSlug } }));
    const cleanups: Array<() => void> = [];

    /** A fresh client per test that records every query error the cache stores. */
    const setup = (
      defaultOptions: DefaultOptions = { queries: { retry: false }, mutations: { retry: false } },
    ) => {
      const client = new QueryClient({ defaultOptions });
      const errors: string[] = [];
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error") {
          errors.push((event.action.error as Error).message);
        }
      });
      cleanups.push(() => {
        unsubscribe();
        client.clear();
      });
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children);
      const introspectionQueries = () =>
        client
          .getQueryCache()
          .findAll({ predicate: (query) => introspectionPrefixes.has(query.queryKey[0] as string) });
      return { client, errors, wrapper, introspectionQueries };
    };

    const renderMutations = (wrapper: ReturnType<typeof setup>["wrapper"]) =>
      renderHook(
        () => ({
          publish: useSchemasReload(),
          rollback: useSchemaRollback(),
          importFile: useImportSchemaFile({} as never),
        }),
        { wrapper },
      );

    const expectUnfetched = (client: QueryClient, queryKey: unknown[]) => {
      const state = client.getQueryCache().find({ queryKey, exact: true })?.state;
      expect(state).toBeDefined();
      expect(state?.fetchStatus).toBe("idle");
      expect(state?.fetchFailureCount).toBe(0);
      expect(state?.errorUpdateCount).toBe(0);
    };

    const queryFieldsOf = (schema: unknown) =>
      Object.keys((schema as GraphQLSchema).getQueryType()?.getFields() ?? {});

    beforeEach(() => {
      vi.mocked(configurationService.reloadSchemas).mockResolvedValue({ isSuccess: true } as never);
      vi.mocked(configurationService.rollbackSchemaVersion).mockResolvedValue({
        isSuccess: true,
        message: "Version 3 is live.",
        errors: null,
        data: { version: 3, previousVersion: 5 },
      });
      vi.mocked(configurationService.importSchemaFile).mockResolvedValue({ isSuccess: true } as never);
      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(introspectionResult);
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockResolvedValue({ data: [] } as never);
    });

    afterEach(() => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      selectProject("t1", "slug1");
    });

    // H1, C1, C2 (E1)
    it("records no query error when an import follows a publish with no reader mounted", async () => {
      const { client, errors, wrapper } = setup();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.publish.mutateAsync());
      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(errors).toEqual([]);
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expectUnfetched(client, rawKey);
      expectUnfetched(client, builtKey);
      expect(client.getQueryData(rawKey)).toEqual(introspectionResult);
      expect(queryFieldsOf(client.getQueryData(builtKey))).toEqual(["hello"]);
    });

    // H2 (E2)
    it("records no query error when an import follows a rollback with no reader mounted", async () => {
      const { client, errors, wrapper } = setup();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.rollback.mutateAsync(3));
      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(errors).toEqual([]);
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expectUnfetched(client, rawKey);
      expectUnfetched(client, builtKey);
      expect(client.getQueryData(rawKey)).toEqual(introspectionResult);
    });

    // H3, H4 (E4)
    it("invalidates only the schema lists and pending changes on import", async () => {
      const { client, wrapper } = setup();
      const invalidateQueries = vi.spyOn(client, "invalidateQueries");
      const { result } = renderMutations(wrapper);

      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(invalidateQueries.mock.calls).toEqual([
        [{ queryKey: ["schema-list", "t1"] }],
        [{ queryKey: ["unadapted-change-logs", "t1"] }],
        [{ queryKey: ["security-performance-schema-list", "t1"] }],
      ]);
      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
    });

    // H5, H7 (E3)
    it("refreshes mounted readers once on publish and leaves them untouched on import", async () => {
      const { errors, wrapper } = setup();
      const { result } = renderHook(
        () => ({
          raw: useRawIntrospectionQuery({ projectKey: "t1" }),
          built: useGraphQLIntrospection({ projectShortKey: "slug1" }),
          publish: useSchemasReload(),
          importFile: useImportSchemaFile({} as never),
        }),
        { wrapper },
      );
      await waitFor(() => {
        expect(result.current.raw.isSuccess).toBe(true);
        expect(result.current.built.isSuccess).toBe(true);
      });
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(2);

      vi.mocked(configurationService.executeGraphQLOperation).mockResolvedValue(worldIntrospectionResult);
      await act(() => result.current.publish.mutateAsync());

      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(3);
      // Observers are notified on the next tick, after mutateAsync resolves.
      await waitFor(() => expect(result.current.raw.data).toEqual(worldIntrospectionResult));
      await waitFor(() => expect(queryFieldsOf(result.current.built.data)).toEqual(["hello", "world"]));
      const rawAfterPublish = result.current.raw.data;
      const builtAfterPublish = result.current.built.data;

      await act(() => result.current.importFile.mutateAsync({} as never));
      await waitFor(() => expect(result.current.importFile.isSuccess).toBe(true));

      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(3);
      expect(result.current.raw.data).toBe(rawAfterPublish);
      expect(result.current.built.data).toBe(builtAfterPublish);
      expect(errors).toEqual([]);
    });

    // H6
    it("re-reads the served schema once on rollback and writes it under both reader keys", async () => {
      const { client, wrapper } = setup();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.rollback.mutateAsync(3));

      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(rawKey)).toEqual(introspectionResult);
      expect(client.getQueryData(builtKey)).toBeInstanceOf(GraphQLSchema);
      expect(queryFieldsOf(client.getQueryData(builtKey))).toEqual(["hello"]);
    });

    // H8
    it("still refetches a mounted pending-changes reader on import", async () => {
      const { wrapper } = setup();
      const { result } = renderHook(
        () => ({
          changeLogs: useGetUnadaptedChangeLogs({ projectKey: "t1" }),
          importFile: useImportSchemaFile({} as never),
        }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.changeLogs.isSuccess).toBe(true));
      vi.mocked(configurationService.getUnadaptedChangeLogs).mockClear();

      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(configurationService.getUnadaptedChangeLogs).toHaveBeenCalledTimes(1);
    });

    // H9 (E7)
    it("fetches once when a reader mounts after a publish and an import", async () => {
      const { errors, wrapper } = setup();
      const { result } = renderMutations(wrapper);
      await act(() => result.current.publish.mutateAsync());
      await act(() => result.current.importFile.mutateAsync({} as never));
      vi.mocked(configurationService.executeGraphQLOperation).mockClear();

      const reader = renderHook(() => useRawIntrospectionQuery({ projectKey: "t1" }), { wrapper });

      await waitFor(() => expect(reader.result.current.isFetching).toBe(false));
      expect(reader.result.current.isSuccess).toBe(true);
      expect(reader.result.current.data).toEqual(introspectionResult);
      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([]);
    });

    // C3: the app's production query defaults (providers/query-provider.tsx)
    it("never retries an introspection query on import with the production query defaults", async () => {
      const { errors, wrapper, introspectionQueries } = setup({
        queries: { staleTime: 60 * 1000, retry: 1 },
      });
      const { result } = renderMutations(wrapper);

      await act(() => result.current.publish.mutateAsync());
      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(introspectionQueries()).toHaveLength(2);
      for (const query of introspectionQueries()) {
        expect(query.state.fetchFailureCount).toBe(0);
        expect(query.state.fetchStatus).toBe("idle");
      }
      expect(errors).toEqual([]);
    });

    // C4 (E6)
    it("does not refetch another project's cached introspection on import", async () => {
      const { client, wrapper } = setup();
      const other = renderHook(() => useRawIntrospectionQuery({ projectKey: "t2" }), { wrapper });
      await waitFor(() => expect(other.result.current.isSuccess).toBe(true));
      other.unmount();
      const otherUpdatedAt = client.getQueryState(["graphql-raw-introspection", "t2"])?.dataUpdatedAt;
      vi.mocked(configurationService.executeGraphQLOperation).mockClear();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
      expect(client.getQueryState(["graphql-raw-introspection", "t2"])?.dataUpdatedAt).toBe(otherUpdatedAt);
    });

    // C5 (E5)
    it("invalidates nothing and reads no introspection when the import request fails", async () => {
      const { client, wrapper } = setup();
      const invalidateQueries = vi.spyOn(client, "invalidateQueries");
      vi.mocked(configurationService.importSchemaFile).mockRejectedValue(new Error("upload failed"));
      const { result } = renderMutations(wrapper);

      await act(async () => {
        await expect(result.current.importFile.mutateAsync({} as never)).rejects.toThrow("upload failed");
      });

      await waitFor(() => expect(result.current.importFile.isError).toBe(true));
      expect(invalidateQueries).not.toHaveBeenCalled();
      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
    });

    // C6
    it("reads no introspection when the publish fails", async () => {
      const { wrapper, introspectionQueries } = setup();
      vi.mocked(configurationService.reloadSchemas).mockRejectedValue(new Error("does not build"));
      const { result } = renderMutations(wrapper);

      await act(async () => {
        await expect(result.current.publish.mutateAsync()).rejects.toThrow("does not build");
      });

      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
      expect(introspectionQueries()).toHaveLength(0);
    });

    // C7
    it("reads no introspection when the rollback fails", async () => {
      const { wrapper, introspectionQueries } = setup();
      vi.mocked(configurationService.rollbackSchemaVersion).mockRejectedValue(new Error("404"));
      const { result } = renderMutations(wrapper);

      await act(async () => {
        await expect(result.current.rollback.mutateAsync(9)).rejects.toThrow("404");
      });

      expect(configurationService.executeGraphQLOperation).not.toHaveBeenCalled();
      expect(introspectionQueries()).toHaveLength(0);
    });

    // C9
    it("completes a publish and an import without a selected tenant", async () => {
      selectProject("", "");
      const { errors, wrapper, introspectionQueries } = setup();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.publish.mutateAsync());
      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(introspectionQueries()).toHaveLength(0);
      expect(errors).toEqual([]);
    });

    // C10
    it("seeds the publish response when an import finishes while the publish still waits for it", async () => {
      const { client, errors, wrapper } = setup();
      let resolveIntrospection: (value: unknown) => void = () => undefined;
      vi.mocked(configurationService.executeGraphQLOperation).mockImplementation(
        () => new Promise((resolve) => {
          resolveIntrospection = resolve;
        }),
      );
      const { result } = renderMutations(wrapper);

      let publishDone: Promise<unknown> = Promise.resolve();
      act(() => {
        publishDone = result.current.publish.mutateAsync();
      });
      await waitFor(() => expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1));
      await act(() => result.current.importFile.mutateAsync({} as never));
      await act(async () => {
        resolveIntrospection(introspectionResult);
        await publishDone;
      });

      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([]);
      expect(client.getQueryData(rawKey)).toEqual(introspectionResult);
      expect(queryFieldsOf(client.getQueryData(builtKey))).toEqual(["hello"]);
    });

    // C11
    it("records no query error for two imports in a row after a publish", async () => {
      const { client, errors, wrapper } = setup();
      const { result } = renderMutations(wrapper);

      await act(() => result.current.publish.mutateAsync());
      await act(() => result.current.importFile.mutateAsync({} as never));
      await act(() => result.current.importFile.mutateAsync({} as never));

      expect(configurationService.executeGraphQLOperation).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([]);
      expectUnfetched(client, rawKey);
      expectUnfetched(client, builtKey);
    });
  });
});
