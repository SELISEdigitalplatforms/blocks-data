using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Services;

public interface ISchemaDefinitionRegistry
{
    Task<SchemaDefinitionExtended?> GetByNameAsync(string schemaName);
    Task<IReadOnlyList<SchemaDefinitionExtended>> GetAllAsync();
    Task ReloadAsync();
}
