using Blocks.Genesis;
using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using MongoDB.Driver;
using StackExchange.Redis;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class DataSourceService : IDataSourceService
{
    private readonly ICacheClient _cacheClient;
    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly IProjectService _projectService;
 
    public DataSourceService(
        IDbRepository repository,
        ICacheClient cacheClient,
        IRequestValidator requestValidator,
        IProjectService projectService)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _cacheClient = cacheClient ?? throw new ArgumentNullException(nameof(cacheClient));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _projectService = projectService ?? throw new ArgumentNullException(nameof(projectService));
    }

    public async Task<ServiceResponse<DataSourceResponse>> GetDataSource(string projectKey)
    {
        var filter = Builders<DataServiceConfiguration>.Filter.Eq(x => x.IsDeleted, false);
        var dataServiceConfiguration = await _repository.GetItemAsync(filter);
        
        if (dataServiceConfiguration is null)
            return new ServiceResponse<DataSourceResponse>().SetErrorMessage("Data source not found.");

        var projectShortKey = await _projectService.GetTenantSlugAsync(projectKey);
        var response = new DataSourceResponse
        {
            DbConnectionString = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(dataServiceConfiguration.DbConnectionString)),
            DatabaseName = dataServiceConfiguration.DatabaseName,
            ProjectKey = projectKey,
            ProjectShortKey = projectShortKey,
            ItemId = dataServiceConfiguration.ItemId
        };

        return new ServiceResponse<DataSourceResponse>().SetSuccess(response);
    }
    public async Task<ServiceResponse<ActionResponse>> InsertDataSource(CreateDataSourceRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var dataServiceConfiguration = await _repository.GetItemAsync<DataServiceConfiguration>(request.ItemId);

        if (dataServiceConfiguration is not null)
        {
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Data source with this ID already exists.");
        }

        dataServiceConfiguration = new DataServiceConfiguration
        {
            ItemId = request.ItemId,
            DbConnectionString = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(request.ConnectionString)),
            DatabaseName = request.DatabaseName
        };
        dataServiceConfiguration.InjectDefaultValue();

        var result = await _repository.InsertAsync(dataServiceConfiguration);
        await CacheDataSource(result, request.ProjectKey);

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { ItemId = result.ItemId });
    }
    public async Task<ServiceResponse<ActionResponse>> UpdateDataSource(UpdateDataSourceRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var dataServiceConfiguration = await _repository.GetItemAsync<DataServiceConfiguration>(request.ItemId);
        if (dataServiceConfiguration is null)
            return
            new ServiceResponse<ActionResponse>()
            .SetErrorMessage("Data source with this ItemId already exist.")
            .SetHttpStatusCode(204);

        dataServiceConfiguration.DbConnectionString = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(request.ConnectionString));
        dataServiceConfiguration.DatabaseName = request.DatabaseName;
        var result = await _repository.UpdateAsync(dataServiceConfiguration);
        await CacheDataSource(dataServiceConfiguration, request.ProjectKey);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse
        {
            ItemId = result.ItemId,
            Acknowledged = result.Acknowledged,
            TotalImpactedData = result.TotalImpactedData
        });
    }

    private async Task CacheDataSource(DataServiceConfiguration dataServiceConfiguration, string projectKey)
    {
        var blocksCtx = BlocksContext.GetContext();
        if (blocksCtx is null)
            return;

        if (await _cacheClient.KeyExistsAsync(projectKey))
            await _cacheClient.RemoveKeyAsync(projectKey);

        if (!dataServiceConfiguration.IsDeleted)
        {
            await _cacheClient.AddHashValueAsync(projectKey, [
                    new HashEntry(nameof(DataServiceConfiguration.DbConnectionString),
                dataServiceConfiguration.DbConnectionString),
            new HashEntry(nameof(DataServiceConfiguration.DatabaseName), dataServiceConfiguration.DatabaseName)
                ]);
        }
    }
}
