import { API_BASES } from "@/constants/endpoint.constant";
import { IImportFile } from "@/data-gateway/models/schema-import-export-notification";
import { http } from "@/lib/http-client";
import {
  CONFIGURATION_ENDPOINTS,
  DATA_ACCESS_ENDPOINTS,
  DATA_MANAGE_ENDPOINTS,
  DATA_VALIDATION_ENDPOINTS,
  DATA_VALIDATION_REGEX_ENDPOINTS,
  SCHEMA_ENDPOINTS,
} from "../constants/endpoint.constant";
import {
  ICreatePolicyPayload,
  ICreatePolicyResponse,
  ICreateSchemaFieldValidationPayload,
  ICreateSchemaPayload,
  ICreateSchemaResponse,
  IDataServiceConfiguration,
  IDataServiceConfigurationResponse,
  IDefaultResponse,
  IDeleteMockDataPayload,
  IDeleteMockDataResponse,
  IDeletePolicyPayload,
  IDeletePolicyResponse,
  IDeleteSchemaFieldValidationPayload,
  IGetPolicyResponse,
  IGetSchemaDetailsResponse,
  IGetSchemaFieldValidationPayload,
  IGetSchemaFieldValidationResponse,
  IGetSchemaListPayload,
  IGetSchemaListResponse,
  IGetUnAdaptedChangeLogsPayload,
  IMockDataResponse,
  ISchemaExportPayload,
  ISchemaExportResponse,
  ISetDataAccessPayload,
  ISetDataAccessResponse,
  ISetRowColumnPermissionPayload,
  IUnadaptedChangeLogsResponse,
  IUpdatePolicyPayload,
  IUpdateSchemaStructure,
} from "../models/data-service";

class ConfigurationService {
  createDataSource(
    payload: IDataServiceConfiguration,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.post(CONFIGURATION_ENDPOINTS.GET, payload);
  }

  updateDataSource(
    payload: IDataServiceConfiguration,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.put(CONFIGURATION_ENDPOINTS.GET, payload);
  }

  getDataServiceDetails(): Promise<IDataServiceConfigurationResponse> {
    return http.get(CONFIGURATION_ENDPOINTS.GET);
  }

  reloadSchemas(): Promise<IDataServiceConfigurationResponse> {
    const url = `${API_BASES.UDS}/schema-configurations/reload`;
    return http.post(url, {});
  }

  getSchemaList(
    payload: IGetSchemaListPayload,
  ): Promise<IGetSchemaListResponse> {
    const url = `${SCHEMA_ENDPOINTS.LIST}?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&SchemaType=${payload.schemaType}`;
    return http.get(url);
  }

  getSecurityAndPerformanceSchemaList(
    payload: IGetSchemaListPayload,
  ): Promise<IGetSchemaListResponse> {
    const url = `${API_BASES.UDS}/schemas/aggregation?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&SchemaType=${payload.schemaType}`;
    return http.get(url);
  }

  getSchemaDetails(
    id: string,
    projectKey: string,
  ): Promise<IGetSchemaDetailsResponse> {
    const params = new URLSearchParams({ id });
    return http.get(`${API_BASES.UDS}/schemas/get-by-id?${params.toString()}`);
  }

  createSchema(payload: ICreateSchemaPayload): Promise<ICreateSchemaResponse> {
    return http.post(SCHEMA_ENDPOINTS.CREATE_INFO, payload);
  }

  updateSchema(
    payload: ICreateSchemaPayload,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.put(SCHEMA_ENDPOINTS.UPDATE_INFO, payload);
  }

  updateSchemaStructure(
    payload: IUpdateSchemaStructure,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.post(SCHEMA_ENDPOINTS.UPDATE_FIELDS, payload);
  }

  deleteSchema(payload: {
    id: string;
    projectKey: string;
  }): Promise<IDataServiceConfigurationResponse> {
    return http.delete(
      `${SCHEMA_ENDPOINTS.DELETE}?id=${payload.id}`,
    );
  }

  setDataAccess(
    payload: ISetDataAccessPayload,
  ): Promise<ISetDataAccessResponse> {
    return http.post(DATA_ACCESS_ENDPOINTS.MANAGE, payload);
  }

  setRowColumnPermissions(
    payload: ISetRowColumnPermissionPayload,
  ): Promise<ISetDataAccessResponse> {
    return http.post(DATA_ACCESS_ENDPOINTS.SECURITY_CHANGE, payload);
  }

  /**
   * POST arbitrary GraphQL to the data gateway. Optional headers are used for
   * introspection (`x-graphql-playground`) so the gateway can expose the full schema.
   */
  executeGraphQLOperation(
    query: string,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    const url = `${API_BASES.UDS}/gateway`;
    return http.post(url, { query }, headers);
  }

  getMockData(): Promise<IMockDataResponse> {
    return http.get(`${API_BASES.UDS}/mock-data`);
  }

  deleteMockData(
    payload: IDeleteMockDataPayload,
  ): Promise<IDeleteMockDataResponse> {
    return http.post(DATA_MANAGE_ENDPOINTS.DELETE_MOCK_DATA, payload);
  }

  getPolicy(
    entityName: string,
    projectKey: string,
  ): Promise<IGetPolicyResponse> {
    const params = new URLSearchParams({
      schemaName: entityName
    });
    return http.get(
      `${API_BASES.UDS}/data-access/policy/get?${params.toString()}`,
    );
  }

  createPolicy(payload: ICreatePolicyPayload): Promise<ICreatePolicyResponse> {
    return http.post<ICreatePolicyResponse>(
      DATA_ACCESS_ENDPOINTS.POLICY_CREATE,
      payload,
    );
  }

  updatePolicy(payload: IUpdatePolicyPayload): Promise<ICreatePolicyResponse> {
    return http.post(DATA_ACCESS_ENDPOINTS.POLICY_UPDATE, payload);
  }

  deletePolicy(payload: IDeletePolicyPayload): Promise<IDeletePolicyResponse> {
    const params = new URLSearchParams({
      itemId: payload.itemId
    });
    const url = `${API_BASES.UDS}/data-access/policy/delete?${params.toString()}`;
    return http.delete(url);
  }

  getUnadaptedChangeLogs(
    payload: IGetUnAdaptedChangeLogsPayload,
  ): Promise<IUnadaptedChangeLogsResponse> {
    return http.get(
      `${SCHEMA_ENDPOINTS.UNADAPTED_CHANGE_LOGS}`,
    );
  }

  getSchemaFieldValidation(
    payload: IGetSchemaFieldValidationPayload,
  ): Promise<IGetSchemaFieldValidationResponse> {
    const params = new URLSearchParams({
      schemaId: payload.schemaId,
      fieldName: payload.fieldName
    });
    return http.get(
      `${API_BASES.UDS}/data-validations/by-schema-and-field?${params.toString()}`,
    );
  }

  createSchemaFieldValidation(
    payload: ICreateSchemaFieldValidationPayload,
  ): Promise<IDefaultResponse> {
    return http.post(DATA_VALIDATION_ENDPOINTS.CREATE, payload);
  }

  updateSchemaFieldValidation(
    payload: ICreateSchemaFieldValidationPayload,
  ): Promise<IDefaultResponse> {
    return http.put(DATA_VALIDATION_ENDPOINTS.UPDATE, payload);
  }

  exportSchema(payload: ISchemaExportPayload): Promise<ISchemaExportResponse> {
    return http.post(`${API_BASES.UDS}/schema-exchange/export`, payload);
  }

  deleteSchemaFieldValidation(
    payload: IDeleteSchemaFieldValidationPayload,
  ): Promise<IDefaultResponse> {
    return http.delete(
      `${DATA_VALIDATION_ENDPOINTS.DELETE}?validationId=${payload.id}`,
    );
  }

  generateRegex(payload: {
    description: string;
  }): Promise<{ pattern: string; errorMessage?: string }> {
    return http.post(DATA_VALIDATION_REGEX_ENDPOINTS.GENERATE_REGEX, payload);
  }

  importSchemaFile = (payload: IImportFile) => {
    const url = `${API_BASES.UDS}/schema-exchange/import`;
    return http.post(url, payload);
  };
}

export const configurationService = new ConfigurationService();
