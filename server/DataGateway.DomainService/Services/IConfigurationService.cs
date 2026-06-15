namespace DataGateway.DomainService.Services;

public interface IConfigurationService
{
    Task ReloadAsync(string projectShortKey, CancellationToken cancellationToken);
    Task AddSchemaAsync(string projectShortKey, CancellationToken cancellationToken);
    Task RemoveSchemaAsync(string projectShortKey, CancellationToken cancellationToken);
}
