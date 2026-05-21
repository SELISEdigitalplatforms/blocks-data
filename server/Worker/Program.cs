using Blocks.Genesis;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using Worker;
using Worker.Configuration;
using Worker.Consumers;
using Storage.DomainService.Storage;
using Storage.DomainService.Utilities;
using DataGateway.DomainService.Models;

const string _serviceName = GraphQlConstant.WorkerServiceName;

var vaultType = ResolveVaultType();
Console.WriteLine($"Using Genesis vault type: {vaultType}");
var secret = await ApplicationConfigurations.ConfigureLogAndSecretsAsync(_serviceName, VaultType.Azure);
var cloudBuildSecret = await CloudBuildSecret.ProcessBlocksSecret(VaultType.Azure);

await CreateHostBuilder(args).Build().RunAsync();

IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
        .ConfigureAppConfiguration((context, builder) =>
        {
            // ApplicationConfigurations.ConfigureWorkerEnv(builder, args);
        })
        .ConfigureServices((services) =>
        {
            services.AddHttpClient();

            services.Configure<VerioSystemSettings>(services.BuildServiceProvider().GetRequiredService<IConfiguration>().GetSection("VerioSystemSettings"));

            services.AddHostedService<PeriodicPingBackgroundService>();

            services.AddSingleton<IConsumer<MigrationCompletionEvent>, MigrationCompletionEventConsumer>();
            services.AddSingleton<IConsumer<SchemaExportEvent>, SchemaExportEventConsumer>();
            services.AddSingleton<IConsumer<SchemaImportEvent>, SchemaImportEventConsumer>();
            services.AddSingleton<IConsumer<CreateDefaultFolderEvent>, CreateDefaultFolderEventConsumer>();
            services.AddSingleton<IConsumer<PostBuildQueue>, PostBuildConsumer>();
            services.AddSingleton<ICloudBuildSecret>(cloudBuildSecret);
            services.AddStorageDomainServices();
            services.RegisterSchemaServices();

            ApplicationConfigurations.ConfigureWorker(services, GraphQlConstant.GetMessageConfiguration(secret.MessageConnectionString));
            //ApplicationConfigurations.ConfigureWorker(services, IdentifierConstants.GetMessageConfiguration(secret.MessageConnectionString));
        });

static VaultType ResolveVaultType()
{
    var configuredVaultType = Environment.GetEnvironmentVariable("BLOCKS_VAULT_TYPE");
    if (!string.IsNullOrWhiteSpace(configuredVaultType) &&
        Enum.TryParse<VaultType>(configuredVaultType, true, out var parsedVaultType))
    {
        return parsedVaultType;
    }

    var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ??
                      Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");

    return string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase)
        ? VaultType.OnPrem
        : VaultType.Azure;
}
