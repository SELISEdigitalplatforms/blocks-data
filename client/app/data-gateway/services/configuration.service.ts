import { http } from "@/lib/http-client";
import {
  ICreatePolicyPayload,
  ICreatePolicyResponse,
  ICreateSchemaPayload,
  ICreateSchemaResponse,
  IDataServiceConfiguration,
  IDataServiceConfigurationResponse,
  IDeleteMockDataResponse,
  IDeleteMockDataPayload,
  IGetSchemaDetailsResponse,
  IGetSchemaListPayload,
  IGetSchemaListResponse,
  IMockDataResponse,
  IGetPolicyResponse,
  ISetDataAccessPayload,
  ISetDataAccessResponse,
  ISetRowColumnPermissionPayload,
  IUnadaptedChangeLogsResponse,
  IUpdateSchemaStructure,
  IUpdatePolicyPayload,
  IDeletePolicyPayload,
  IDeletePolicyResponse,
  IGetConfigurationPayload,
  IGetUnAdaptedChangeLogsPayload,
  IInitiateDataGatewayPipelinePayload,
  IGetSchemaFieldValidationPayload,
  IGetSchemaFieldValidationResponse,
  ICreateSchemaFieldValidationPayload,
  ISchemaExportPayload,
  ISchemaExportResponse,
  IDefaultResponse,
  IDeleteSchemaFieldValidationPayload,
} from "../models/data-service";
import {
  DATA_SOURCE_ENDPOINTS,
  SCHEMA_ENDPOINTS,
  DATA_ACCESS_ENDPOINTS,
  DATA_MANAGE_ENDPOINTS,
  DATA_VALIDATION_ENDPOINTS,
  PIPELINE_ENDPOINTS,
} from "../constants/endpoint.constant";
import { IImportFile } from "@/data-gateway/models/schema-import-export-notification";
import {
  API_BASES,
  getGraphqlGatewayExecuteOrigin,
} from "@/constants/endpoint.constant";

class ConfigurationService {
  createDataSource(
    payload: IDataServiceConfiguration,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.post(DATA_SOURCE_ENDPOINTS.ADD, payload);
  }

  updateDataSource(
    payload: IDataServiceConfiguration,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.put(DATA_SOURCE_ENDPOINTS.UPDATE, payload);
  }

  getDataServiceDetails(
    payload: IGetConfigurationPayload,
  ): Promise<IDataServiceConfigurationResponse> {
    return http.get(`${DATA_SOURCE_ENDPOINTS.GET}/${payload.projectKey}/get`);
  }

  reloadSchemas(payload: {
    projectKey: string;
    projectShortKey?: string;
  }): Promise<IDataServiceConfigurationResponse> {
    const url = `${getGraphqlGatewayExecuteOrigin()}/${payload.projectShortKey}${API_BASES.UDS}/configurations/reload?projectKey=${encodeURIComponent(payload.projectKey)}`;
    return http.post(url, {}, undefined, { absoluteUrl: true });
  }

  getSchemaList(
    payload: IGetSchemaListPayload,
  ): Promise<IGetSchemaListResponse> {
    const url = `${SCHEMA_ENDPOINTS.LIST}?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&ProjectKey=${payload.projectKey}&SchemaType=${payload.schemaType}`;
    return http.get(url);
  }

  getSecurityAndPerformanceSchemaList(
    payload: IGetSchemaListPayload,
  ): Promise<IGetSchemaListResponse> {
    const url = `${API_BASES.UDS}/schemas/aggregation?Keyword=${payload.keyword}&PageSize=${payload.pageSize}&PageNo=${payload.pageNo}&SortDescending=${payload.sortDescending}&SortBy=${payload.sortBy}&ProjectKey=${payload.projectKey}&SchemaType=${payload.schemaType}`;
    return http.get(url);
  }

  getSchemaDetails(
    id: string,
    projectKey: string,
  ): Promise<IGetSchemaDetailsResponse> {
    const params = new URLSearchParams({ id, projectKey });
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
      `${SCHEMA_ENDPOINTS.DELETE}/${payload.id}?projectKey=${payload.projectKey}`,
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
    projectShortKey: string,
    query: string,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    const url = `${getGraphqlGatewayExecuteOrigin()}/${projectShortKey}/gateway`;
    return http.post(url, { query }, headers, { absoluteUrl: true });
  }

  getMockData(projectKey: string): Promise<IMockDataResponse> {
    const params = new URLSearchParams({ projectKey });
    return http.get(
      `${API_BASES.UDS}/data-manage/mock-data?${params.toString()}`,
    );
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
      schemaName: entityName,
      projectKey,
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
      itemId: payload.itemId,
      projectKey: payload.projectKey,
    });
    const url = `${API_BASES.UDS}/data-access/policy/delete?${params.toString()}`;
    return http.delete(url);
  }

  getUnadaptedChangeLogs(
    payload: IGetUnAdaptedChangeLogsPayload,
  ): Promise<IUnadaptedChangeLogsResponse> {
    return http.get(
      `${SCHEMA_ENDPOINTS.UNADAPTED_CHANGE_LOGS}?projectKey=${payload.projectKey}`,
    );
  }

  getPodActiveStatus(slug: string): Promise<undefined | { message: string }> {
    const url = `${getGraphqlGatewayExecuteOrigin()}/${slug}ping`;
    return http.get(url, undefined, { absoluteUrl: true });
  }

  initiateDataGatewayPipeline(
    payload: IInitiateDataGatewayPipelinePayload,
  ): Promise<unknown> {
    return http.get(
      `${PIPELINE_ENDPOINTS.INITIATE}?ProjectKey=${payload.projectKey}`,
    );
  }

  getSchemaFieldValidation(
    payload: IGetSchemaFieldValidationPayload,
  ): Promise<IGetSchemaFieldValidationResponse> {
    const params = new URLSearchParams({
      schemaId: payload.schemaId,
      fieldName: payload.fieldName,
      projectKey: payload.projectKey,
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
      `${DATA_VALIDATION_ENDPOINTS.DELETE}/${payload.id}?projectKey=${payload.projectKey}`,
    );
  }

  importSchemaFile = (payload: IImportFile) => {
    const url = `${API_BASES.UDS}/schema-exchange/import`;
    return http.post(url, payload);
  };
}

/** Headers required by the gateway for full introspection from the playground. */
export const GRAPHQL_PLAYGROUND_INTROSPECTION_HEADERS: Record<string, string> =
  {
    "x-graphql-playground": "true",
  };

export const configurationService = new ConfigurationService();
