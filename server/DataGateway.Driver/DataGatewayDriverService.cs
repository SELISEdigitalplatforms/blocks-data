using System;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;

namespace DataGateway.Driver;

public class DataGatewayDriverService : IDataGatewayDriverService
{
    private readonly ISchemaDefinitionService _schemaDefinitionService;

    public DataGatewayDriverService(ISchemaDefinitionService schemaDefinitionService)
    {
        _schemaDefinitionService = schemaDefinitionService;
    }

    public async Task<ServiceResponse<ActionResponse>> CreateSchemaAsync(CreateSchemaRequest request)
    {
        return await _schemaDefinitionService.CreateSchemaAsync(request);
    }

    public async Task<ServiceResponse<ActionResponse>> CreateSchemaDefinitionAsync(CreateSchemaDefinitionRequest request)
    {
        return await _schemaDefinitionService.CreateSchemaDefinitionAsync(request);
    }
    public async Task<ServiceResponse<ActionResponse>> UpdateSchemaAsync(UpdateSchemaRequest request)
    {
        return await _schemaDefinitionService.UpdateSchemaAsync(request);
    }

    public async Task<ServiceResponse<ActionResponse>> UpdateSchemaDefinitionAsync(UpdateSchemaDefinitionRequest request)
    {
        return await _schemaDefinitionService.UpdateSchemaDefinitionAsync(request);
    }
    public async Task<ServiceResponse<ActionResponse>> SaveFieldDefinitionAsync(SaveFieldDefinitionRequest request)
    {
        return await _schemaDefinitionService.SaveFieldDefinitionAsync(request);
    }

    public async Task<ServiceResponse<ActionResponse>> DeleteSchemaAsync(string id)
    {
        return await _schemaDefinitionService.DeleteSchemaAsync(id);
    }

    public async Task<PaginationResponse<SchemaDefinitionResponse>> GetAllSchemasAsync(GetSchemaDefinitionListRequest request)
    {
        return await _schemaDefinitionService.GetAllSchemasAsync(request);
    }

    public async Task<ServiceResponse<SchemaAggregationResponse>> GetSchemaAggregationAsync()
    {
        return await _schemaDefinitionService.GetSchemaAggregationAsync();
    }

    public async Task<ServiceResponse<SchemaDefinitionResponse>> GetSchemaByIdAsync(string id)
    {
        return await _schemaDefinitionService.GetSchemaByIdAsync(id);
    }
    public async Task<Dictionary<string, bool>> ResetSchemaStructureAsync(int pageNo = 1, int pageSize = 10)
    {
        return await _schemaDefinitionService.ResetSchemaStructureAsync(pageNo, pageSize);
    }

    public async Task<ServiceResponse<CollectionListResponse>> GetEntityCollectionsAsync()
    {
        return await _schemaDefinitionService.GetEntityCollectionsAsync();
    }

    public async Task<ServiceResponse<CollectionDetailResponse>> GetEntityCollectionByNameAsync(string projectSchemaName)
    {
        return await _schemaDefinitionService.GetEntityCollectionByNameAsync(projectSchemaName);
    }
}
