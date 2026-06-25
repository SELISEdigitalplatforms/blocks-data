namespace DataGateway.DomainService.Services;

public interface IConfigurationService
{
    Task<ISchema> BuildSchemaAsync(string tenantId, CancellationToken cancellationToken);
    Task ConfigureSchemaAsync(string tenantId, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken);
    Task ReloadAsync(string tenantId, CancellationToken cancellationToken);
    Task RemoveSchemaAsync(string tenantId, CancellationToken cancellationToken);
}
