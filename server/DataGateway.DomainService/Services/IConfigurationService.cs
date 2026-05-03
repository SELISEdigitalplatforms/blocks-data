namespace DataGateway.DomainService.Services;

public interface IConfigurationService
{
    Task<ISchema> BuildSchemaAsync(string projectShortKey, CancellationToken cancellationToken);
    Task ConfigureSchemaAsync(string projectShortKey, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken);
    Task ReloadAsync(string projectShortKey, CancellationToken cancellationToken);
    Task AddSchemaAsync(string projectShortKey, CancellationToken cancellationToken);
    Task RemoveSchemaAsync(string projectShortKey, CancellationToken cancellationToken);
}
