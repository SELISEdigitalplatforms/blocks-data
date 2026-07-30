using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using SeliseBlocks.ConfigurationDriver;
using Storage.DomainService.Storage;
using Storage.DomainService.Utilities;
using Worker;
using Worker.Configuration;
using Worker.Consumers;

const string _serviceName = GraphQlConstant.WorkerServiceName;

var vaultType = ApplicationConfigurations.ResolveVaultType();
Console.WriteLine($"Using Genesis vault type: {vaultType}");
var secret = await ApplicationConfigurations.ConfigureLogAndSecretsAsync(_serviceName, vaultType);
var cloudBuildSecret = await CloudBuildSecret.ProcessBlocksSecret(vaultType);

await CreateHostBuilder(args).Build().RunAsync();

IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
        .ConfigureAppConfiguration((context, builder) =>
        {
            ApplicationConfigurations.ConfigureWorkerEnv(builder, args);
            builder.AddMongoDbConfiguration(options =>
            {
                options.ConnectionString = secret.DatabaseConnectionString;
                options.DatabaseName = secret.RootDatabaseName;
                options.CollectionName = "Secrets";
                options.SecretKey = "blocks-secret-data";
            });
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
            services.AddSingleton<ICloudBuildSecret>(cloudBuildSecret);
            services.AddStorageDomainServices();
            services.RegisterSchemaServices();

            ApplicationConfigurations.ConfigureWorker(services, GraphQlConstant.GetMessageConfiguration(secret.MessageConnectionString));
        });
