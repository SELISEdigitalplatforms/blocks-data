import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphQLSchema,
  buildSchema,
  introspectionFromSchema,
} from "graphql";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { configurationService } from "../services/configuration.service";
import {
  getPolicyDataQueryOptions,
  useCreateDataSourceConfiguration,
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
  useSchemasReload,
  useSecurityAndPerformanceSchemaList,
  useSetDataAccess,
  useSetRowColumnPermission,
  useUpdateDataSourceConfiguration,
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
    createDataSource: vi.fn(),
    updateDataSource: vi.fn(),
    getDataServiceDetails: vi.fn(),
    reloadSchemas: vi.fn(),
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
        name: "useCreateDataSourceConfiguration",
        hook: useCreateDataSourceConfiguration,
        method: "createDataSource",
        payload: { name: "ds" },
      },
      {
        name: "useUpdateDataSourceConfiguration",
        hook: useUpdateDataSourceConfiguration,
        method: "updateDataSource",
        payload: { name: "ds" },
      },
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
        hook: () => useSetDataAccess("s1"),
        method: "setDataAccess",
        payload: { schemaName: "User" },
      },
      {
        name: "useSetRowColumnPermission",
        hook: () => useSetRowColumnPermission("s1"),
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
        hook: () => useImportSchemaFile({} as never),
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
});
