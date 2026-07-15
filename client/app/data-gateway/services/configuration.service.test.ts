import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { API_BASES } from "@/constants/endpoint.constant";
import { configurationService } from "./configuration.service";
import {
  CONFIGURATION_ENDPOINTS,
  DATA_ACCESS_ENDPOINTS,
  DATA_MANAGE_ENDPOINTS,
  DATA_VALIDATION_ENDPOINTS,
  DATA_VALIDATION_REGEX_ENDPOINTS,
  SCHEMA_ENDPOINTS,
} from "../constants/endpoint.constant";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("ConfigurationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── createDataSource ───────────────────────────────────────────────────────
  describe("createDataSource", () => {
    it("should POST the payload to the configuration endpoint", async () => {
      const payload = { name: "source" } as never;
      const response = { isSuccess: true };
      vi.mocked(http.post).mockResolvedValue(response);

      const result = await configurationService.createDataSource(payload);

      expect(http.post).toHaveBeenCalledWith(CONFIGURATION_ENDPOINTS.GET, payload);
      expect(result).toEqual(response);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(
        configurationService.createDataSource({} as never),
      ).rejects.toThrow("Network error");
    });
  });

  // ─── updateDataSource ───────────────────────────────────────────────────────
  describe("updateDataSource", () => {
    it("should PUT the payload to the configuration endpoint", async () => {
      const payload = { name: "source" } as never;
      vi.mocked(http.put).mockResolvedValue({ isSuccess: true });

      await configurationService.updateDataSource(payload);

      expect(http.put).toHaveBeenCalledWith(CONFIGURATION_ENDPOINTS.GET, payload);
    });
  });

  // ─── getDataServiceDetails ──────────────────────────────────────────────────
  describe("getDataServiceDetails", () => {
    it("should GET the configuration endpoint", async () => {
      const response = { config: {} };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await configurationService.getDataServiceDetails();

      expect(http.get).toHaveBeenCalledWith(CONFIGURATION_ENDPOINTS.GET);
      expect(result).toEqual(response);
    });
  });

  // ─── reloadSchemas ──────────────────────────────────────────────────────────
  describe("reloadSchemas", () => {
    it("should POST an empty body to the reload endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.reloadSchemas();

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.UDS}/schema-configurations/reload`,
        {},
      );
    });
  });

  // ─── getSchemaList ──────────────────────────────────────────────────────────
  describe("getSchemaList", () => {
    it("should GET the list endpoint with all query params", async () => {
      const payload = {
        keyword: "user",
        pageNo: 2,
        pageSize: 25,
        sortDescending: false,
        sortBy: "Name",
        projectKey: "pk",
        schemaType: "1",
      };
      const response = { data: { items: [] } };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await configurationService.getSchemaList(payload);

      expect(http.get).toHaveBeenCalledWith(
        `${SCHEMA_ENDPOINTS.LIST}?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&SchemaType=${payload.schemaType}`,
      );
      expect(result).toEqual(response);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.get).mockRejectedValue(new Error("boom"));
      await expect(
        configurationService.getSchemaList({
          keyword: "",
          pageNo: 1,
          pageSize: 10,
          sortDescending: true,
          sortBy: "CreatedDate",
          projectKey: "",
          schemaType: "",
        }),
      ).rejects.toThrow("boom");
    });
  });

  // ─── getSecurityAndPerformanceSchemaList ────────────────────────────────────
  describe("getSecurityAndPerformanceSchemaList", () => {
    it("should GET the aggregation endpoint with query params", async () => {
      const payload = {
        keyword: "x",
        pageNo: 1,
        pageSize: 10,
        sortDescending: true,
        sortBy: "CreatedDate",
        projectKey: "pk",
        schemaType: "2",
      };
      vi.mocked(http.get).mockResolvedValue({ data: { items: [] } });

      await configurationService.getSecurityAndPerformanceSchemaList(payload);

      expect(http.get).toHaveBeenCalledWith(
        `${API_BASES.UDS}/schemas/aggregation?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&SchemaType=${payload.schemaType}`,
      );
    });
  });

  // ─── getSchemaDetails ───────────────────────────────────────────────────────
  describe("getSchemaDetails", () => {
    it("should GET the get-by-id endpoint with the id query param", async () => {
      const response = { data: { schemaName: "User" } };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await configurationService.getSchemaDetails("s1", "pk");

      const params = new URLSearchParams({ id: "s1" });
      expect(http.get).toHaveBeenCalledWith(
        `${API_BASES.UDS}/schemas/get-by-id?${params.toString()}`,
      );
      expect(result).toEqual(response);
    });
  });

  // ─── createSchema ───────────────────────────────────────────────────────────
  describe("createSchema", () => {
    it("should POST to the create-info endpoint", async () => {
      const payload = { schemaName: "User" } as never;
      vi.mocked(http.post).mockResolvedValue({ itemId: "1" });

      await configurationService.createSchema(payload);

      expect(http.post).toHaveBeenCalledWith(SCHEMA_ENDPOINTS.CREATE_INFO, payload);
    });
  });

  // ─── updateSchema ───────────────────────────────────────────────────────────
  describe("updateSchema", () => {
    it("should PUT to the update-info endpoint", async () => {
      const payload = { schemaName: "User", itemId: "1" } as never;
      vi.mocked(http.put).mockResolvedValue({ isSuccess: true });

      await configurationService.updateSchema(payload);

      expect(http.put).toHaveBeenCalledWith(SCHEMA_ENDPOINTS.UPDATE_INFO, payload);
    });
  });

  // ─── updateSchemaStructure ──────────────────────────────────────────────────
  describe("updateSchemaStructure", () => {
    it("should POST to the update-fields endpoint", async () => {
      const payload = { schemaDefinitionItemId: "1", fields: [] } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.updateSchemaStructure(payload);

      expect(http.post).toHaveBeenCalledWith(SCHEMA_ENDPOINTS.UPDATE_FIELDS, payload);
    });
  });

  // ─── deleteSchema ───────────────────────────────────────────────────────────
  describe("deleteSchema", () => {
    it("should DELETE the schema endpoint with an id query param", async () => {
      vi.mocked(http.delete).mockResolvedValue({ isSuccess: true });

      await configurationService.deleteSchema({ id: "s1", projectKey: "pk" });

      expect(http.delete).toHaveBeenCalledWith(`${SCHEMA_ENDPOINTS.DELETE}?id=s1`);
    });
  });

  // ─── setDataAccess ──────────────────────────────────────────────────────────
  describe("setDataAccess", () => {
    it("should POST to the data-access manage endpoint", async () => {
      const payload = { schemaName: "User" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.setDataAccess(payload);

      expect(http.post).toHaveBeenCalledWith(DATA_ACCESS_ENDPOINTS.MANAGE, payload);
    });
  });

  // ─── setRowColumnPermissions ────────────────────────────────────────────────
  describe("setRowColumnPermissions", () => {
    it("should POST to the security change endpoint", async () => {
      const payload = { schemaName: "User" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.setRowColumnPermissions(payload);

      expect(http.post).toHaveBeenCalledWith(
        DATA_ACCESS_ENDPOINTS.SECURITY_CHANGE,
        payload,
      );
    });
  });

  // ─── executeGraphQLOperation ────────────────────────────────────────────────
  describe("executeGraphQLOperation", () => {
    it("should POST the query to the gateway endpoint", async () => {
      const response = { data: { __schema: {} } };
      vi.mocked(http.post).mockResolvedValue(response);

      const result = await configurationService.executeGraphQLOperation("{ me }");

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.UDS}/gateway`,
        { query: "{ me }" },
        undefined,
      );
      expect(result).toEqual(response);
    });

    it("should forward optional headers", async () => {
      vi.mocked(http.post).mockResolvedValue({});

      await configurationService.executeGraphQLOperation("{ me }", {
        "x-graphql-playground": "true",
      });

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.UDS}/gateway`,
        { query: "{ me }" },
        { "x-graphql-playground": "true" },
      );
    });
  });

  // ─── getMockData ────────────────────────────────────────────────────────────
  describe("getMockData", () => {
    it("should GET the mock-data endpoint", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [] });

      await configurationService.getMockData();

      expect(http.get).toHaveBeenCalledWith(`${API_BASES.UDS}/mock-data`);
    });
  });

  // ─── deleteMockData ─────────────────────────────────────────────────────────
  describe("deleteMockData", () => {
    it("should POST to the delete mock-data endpoint", async () => {
      const payload = { schemaName: "User" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.deleteMockData(payload);

      expect(http.post).toHaveBeenCalledWith(
        DATA_MANAGE_ENDPOINTS.DELETE_MOCK_DATA,
        payload,
      );
    });
  });

  // ─── getPolicy ──────────────────────────────────────────────────────────────
  describe("getPolicy", () => {
    it("should GET the policy endpoint with a schemaName query param", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: {} });

      await configurationService.getPolicy("User", "pk");

      const params = new URLSearchParams({ schemaName: "User" });
      expect(http.get).toHaveBeenCalledWith(
        `${API_BASES.UDS}/data-access/policy/get?${params.toString()}`,
      );
    });
  });

  // ─── createPolicy ───────────────────────────────────────────────────────────
  describe("createPolicy", () => {
    it("should POST to the policy create endpoint", async () => {
      const payload = { schemaId: "s1" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.createPolicy(payload);

      expect(http.post).toHaveBeenCalledWith(
        DATA_ACCESS_ENDPOINTS.POLICY_CREATE,
        payload,
      );
    });
  });

  // ─── updatePolicy ───────────────────────────────────────────────────────────
  describe("updatePolicy", () => {
    it("should POST to the policy update endpoint", async () => {
      const payload = { schemaId: "s1" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.updatePolicy(payload);

      expect(http.post).toHaveBeenCalledWith(
        DATA_ACCESS_ENDPOINTS.POLICY_UPDATE,
        payload,
      );
    });
  });

  // ─── deletePolicy ───────────────────────────────────────────────────────────
  describe("deletePolicy", () => {
    it("should DELETE the policy endpoint with an itemId query param", async () => {
      vi.mocked(http.delete).mockResolvedValue({ isSuccess: true });

      await configurationService.deletePolicy({ itemId: "p1" } as never);

      const params = new URLSearchParams({ itemId: "p1" });
      expect(http.delete).toHaveBeenCalledWith(
        `${API_BASES.UDS}/data-access/policy/delete?${params.toString()}`,
      );
    });
  });

  // ─── getUnadaptedChangeLogs ─────────────────────────────────────────────────
  describe("getUnadaptedChangeLogs", () => {
    it("should GET the unadapted-change-logs endpoint", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [] });

      await configurationService.getUnadaptedChangeLogs({ projectKey: "pk" });

      expect(http.get).toHaveBeenCalledWith(SCHEMA_ENDPOINTS.UNADAPTED_CHANGE_LOGS);
    });
  });

  // ─── getSchemaFieldValidation ───────────────────────────────────────────────
  describe("getSchemaFieldValidation", () => {
    it("should GET the by-schema-and-field endpoint with query params", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: {} });

      await configurationService.getSchemaFieldValidation({
        schemaId: "s1",
        fieldName: "email",
        projectKey: "pk",
      });

      const params = new URLSearchParams({ schemaId: "s1", fieldName: "email" });
      expect(http.get).toHaveBeenCalledWith(
        `${API_BASES.UDS}/data-validations/by-schema-and-field?${params.toString()}`,
      );
    });
  });

  // ─── createSchemaFieldValidation ────────────────────────────────────────────
  describe("createSchemaFieldValidation", () => {
    it("should POST to the data-validations create endpoint", async () => {
      const payload = { schemaId: "s1", fieldName: "email" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.createSchemaFieldValidation(payload);

      expect(http.post).toHaveBeenCalledWith(DATA_VALIDATION_ENDPOINTS.CREATE, payload);
    });
  });

  // ─── updateSchemaFieldValidation ────────────────────────────────────────────
  describe("updateSchemaFieldValidation", () => {
    it("should PUT to the data-validations update endpoint", async () => {
      const payload = { schemaId: "s1", fieldName: "email" } as never;
      vi.mocked(http.put).mockResolvedValue({ isSuccess: true });

      await configurationService.updateSchemaFieldValidation(payload);

      expect(http.put).toHaveBeenCalledWith(DATA_VALIDATION_ENDPOINTS.UPDATE, payload);
    });
  });

  // ─── exportSchema ───────────────────────────────────────────────────────────
  describe("exportSchema", () => {
    it("should POST to the schema-exchange export endpoint", async () => {
      const payload = { schemaIds: ["s1"] } as never;
      vi.mocked(http.post).mockResolvedValue({ url: "x" });

      await configurationService.exportSchema(payload);

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.UDS}/schema-exchange/export`,
        payload,
      );
    });
  });

  // ─── deleteSchemaFieldValidation ────────────────────────────────────────────
  describe("deleteSchemaFieldValidation", () => {
    it("should DELETE the data-validations endpoint with a validationId param", async () => {
      vi.mocked(http.delete).mockResolvedValue({ isSuccess: true });

      await configurationService.deleteSchemaFieldValidation({
        id: "v1",
        projectKey: "pk",
      } as never);

      expect(http.delete).toHaveBeenCalledWith(
        `${DATA_VALIDATION_ENDPOINTS.DELETE}?validationId=v1`,
      );
    });
  });

  // ─── generateRegex ──────────────────────────────────────────────────────────
  describe("generateRegex", () => {
    it("should POST to the generate-regex endpoint", async () => {
      const payload = { description: "email regex" };
      vi.mocked(http.post).mockResolvedValue({ pattern: ".*" });

      const result = await configurationService.generateRegex(payload);

      expect(http.post).toHaveBeenCalledWith(
        DATA_VALIDATION_REGEX_ENDPOINTS.GENERATE_REGEX,
        payload,
      );
      expect(result).toEqual({ pattern: ".*" });
    });
  });

  // ─── importSchemaFile ───────────────────────────────────────────────────────
  describe("importSchemaFile", () => {
    it("should POST to the schema-exchange import endpoint", async () => {
      const payload = { fileName: "schema.json" } as never;
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      await configurationService.importSchemaFile(payload);

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.UDS}/schema-exchange/import`,
        payload,
      );
    });
  });
});
