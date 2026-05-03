using HotChocolate.Execution;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly GraphqlSchemaBuilder _graphqlSchemaBuilder;
    private readonly ILogger<ConfigurationService> _logger;
    private readonly IRequestExecutorResolver _executorResolver;
    private readonly IProjectService _projectService;

    public ConfigurationService(GraphqlSchemaBuilder graphqlSchemaBuilder,
        IRequestExecutorResolver executorResolver, IProjectService projectService, ILogger<ConfigurationService> logger)
    {
        _executorResolver = executorResolver ?? throw new ArgumentNullException(nameof(executorResolver));
        _graphqlSchemaBuilder = graphqlSchemaBuilder ?? throw new ArgumentNullException(nameof(graphqlSchemaBuilder));
        _projectService = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<ISchema> BuildSchemaAsync(string projectShortKey, CancellationToken cancellationToken)
    {
        var builder = SchemaBuilder.New();
        await _graphqlSchemaBuilder.BuildSchema(projectShortKey, builder, cancellationToken);
        _logger.LogInformation("Schema built for project short key: {ProjectShortKey}", projectShortKey);
        return builder.Create();
    }

    public async Task ConfigureSchemaAsync(string projectShortKey, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Configuring schema for project short key: {ProjectShortKey}", projectShortKey);
        await _graphqlSchemaBuilder.BuildSchema(projectShortKey, schemaBuilder, cancellationToken);
        _logger.LogInformation("Schema configured for project short key: {ProjectShortKey}", projectShortKey);
    }

    public async Task ReloadAsync(string projectShortKey, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Reloading schema for project short key: {ProjectShortKey}", projectShortKey);
        await BuildSchemaAsync(projectShortKey, cancellationToken);
        _logger.LogInformation("Schema reloaded for project short key: {ProjectShortKey}", projectShortKey);

        _executorResolver.EvictRequestExecutor(Schema.DefaultName);
        _logger.LogInformation("Request executor evicted for projectShortKey: {ProjectShortKey}", projectShortKey);

    }
    public async Task AddSchemaAsync(string projectKey, CancellationToken cancellationToken)
    {
        var projectShortKey = await _projectService.GetTenantSlugAsync(projectKey);
        if (string.IsNullOrEmpty(projectShortKey))
        {
            throw new Exception("Project short key not found");
        }
        await BuildSchemaAsync(projectShortKey, cancellationToken);
        _executorResolver.EvictRequestExecutor(projectShortKey);
        await _executorResolver.GetRequestExecutorAsync(projectShortKey, cancellationToken);
    }
    public async Task RemoveSchemaAsync(string projectShortKey, CancellationToken cancellationToken)
    {
        // Evict the executor for this key so HotChocolate will remove it
        _executorResolver.EvictRequestExecutor(projectShortKey);
    }
}
