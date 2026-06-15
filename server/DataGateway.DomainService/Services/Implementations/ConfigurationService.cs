using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly ILogger<ConfigurationService> _logger;
    private readonly IProjectService _projectService;
    private readonly ISchemaDefinitionRegistry _schemaRegistry;

    public ConfigurationService(
        IProjectService projectService,
        ISchemaDefinitionRegistry schemaRegistry,
        ILogger<ConfigurationService> logger)
    {
        _projectService = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _schemaRegistry = schemaRegistry ?? throw new ArgumentNullException(nameof(schemaRegistry));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task ReloadAsync(string projectShortKey, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Reloading schema for project short key: {ProjectShortKey}", projectShortKey);
        await _schemaRegistry.ReloadAsync();
        _logger.LogInformation("Schema reloaded for project short key: {ProjectShortKey}", projectShortKey);
    }

    public async Task AddSchemaAsync(string projectKey, CancellationToken cancellationToken)
    {
        var projectShortKey = await _projectService.GetTenantSlugAsync(projectKey);
        if (string.IsNullOrEmpty(projectShortKey))
            throw new Exception("Project short key not found");

        await _schemaRegistry.ReloadAsync();
    }

    public async Task RemoveSchemaAsync(string projectShortKey, CancellationToken cancellationToken)
    {
        await _schemaRegistry.ReloadAsync();
    }
}
