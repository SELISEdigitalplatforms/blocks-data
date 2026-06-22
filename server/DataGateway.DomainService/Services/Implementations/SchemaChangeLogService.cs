using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class SchemaChangeLogService : ISchemaChangeLogService
{
    private readonly IDbRepository _repository;
    private readonly ILogger<SchemaChangeLogService> _logger;
    public SchemaChangeLogService(IDbRepository repository, ILogger<SchemaChangeLogService> logger)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<SchemaChangeLog> CreateSchemaChangeLogAsync(string schemaId, SchemaChangeType changeType, CancellationToken cancellationToken = default)
    {
        try
        {
            var log = new SchemaChangeLog
            {
                SchemaId = schemaId,
                ChangeType = changeType,
                DoesServerAdaptChanges = false
            };
            log.InjectDefaultValue();
            var result = await _repository.InsertAsync(log);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred while creating schema change log for schema: {SchemaId}", schemaId);
            return null;
        }
    }

    public async Task<ServiceResponse<List<SchemaChangeLog>>> GetUnadaptedSchemaChangeLogsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var filter = Builders<SchemaChangeLog>.Filter.Eq(x => x.DoesServerAdaptChanges, false);
            var items = await _repository.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(filter, databaseName: "");
            return new ServiceResponse<List<SchemaChangeLog>>().SetSuccess(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred while getting unadapted schema change logs");
            return new ServiceResponse<List<SchemaChangeLog>>().SetErrorMessage("Error occurred while getting unadapted schema change logs");
        }
    }

    public async Task AdaptAllUnadaptedChangeLogsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Adapting all unadapted schema change logs to server");
            var filter = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), false);
            var update = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), true);
            await _repository.UpdateManyAsync($"{nameof(SchemaChangeLog)}s", filter, update);
            _logger.LogInformation("All unadapted schema change logs have been adapted to server");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred while adapting schema change logs to server");
        }
    }
}
