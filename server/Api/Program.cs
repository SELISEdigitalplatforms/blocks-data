using Blocks.Genesis;
using BlocksTemplate.Api;
using DataGateway.DomainService;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Utilities;

var serviceName = GraphQlConstant.ApiServiceName;
//var vaultType = ResolveVaultType();
//Console.WriteLine($"Using Genesis vault type: {vaultType}");
var secret = await ApplicationConfigurations.ConfigureLogAndSecretsAsync(serviceName, VaultType.Azure);
var cloudBuildSecret = await CloudBuildSecret.ProcessBlocksSecret(VaultType.Azure);

var builder = WebApplication.CreateBuilder(args);

ApplicationConfigurations.ConfigureServices(builder.Services, GraphQlConstant.GetMessageConfiguration(secret.MessageConnectionString));

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 15 * 1024 * 1024; // 15 MB
});

var services = builder.Services;
// Register CloudBuildSecret as Singleton
services.AddSingleton<ICloudBuildSecret>(cloudBuildSecret);

services.AddHealthChecks();

ApplicationConfigurations.ConfigureApi(services, serviceName);

builder.Services.Configure<MvcOptions>(options =>
{
    options.Conventions.Insert(0, new GlobalApiRoutePrefixConvention("api"));
});

var wwwrootPath = Path.Combine(builder.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(wwwrootPath);

//ApplyFrontendRuntimeSettings(builder.Configuration, wwwrootPath);

services.AddDataGatewayDomainServices();
services.AddStorageDomainServices();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGraphQL("/gateway");
app.UseMiddleware<RequestContextMiddleware>();

app.MapControllers();

ApplicationConfigurations.ConfigureMiddleware(app);

var indexHtml = Path.Combine(app.Environment.WebRootPath ?? "", "index.html");

if (File.Exists(indexHtml))
{

    app.MapFallback(async context =>
    {
        var tenantService = context.RequestServices.GetRequiredService<ITenants>();
        var host = context.Request.Host.Value;
        var tenant = tenantService.GetTenantByApplicationDomain(host);
        ApplyFrontendRuntimeSettings(builder.Configuration, wwwrootPath, tenant.TenantId, string.Empty);
        var domain = tenant.Applications.FirstOrDefault(app => app.CookieDomain == host)?.CookieDomain;

        context.Response.Cookies.Append("x-blocks-key", tenant.TenantId, new CookieOptions
        {
            Domain = domain,
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.None,
            Path = "/"
        });

        await context.Response.SendFileAsync(indexHtml);

    });

    // x-blocks-key cookie
    // check if domain match 
    // get google captch key BLOCKS_GOOGLE_SITE_KEY
    // Base Url 
    // Construct URL 

}

await app.RunAsync();

//static VaultType ResolveVaultType()
//{
//    var configuredVaultType = Environment.GetEnvironmentVariable("BLOCKS_VAULT_TYPE");
//    if (!string.IsNullOrWhiteSpace(configuredVaultType) &&
//        Enum.TryParse<VaultType>(configuredVaultType, true, out var parsedVaultType))
//    {
//        return parsedVaultType;
//    }

//    var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ??
//                      Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");

//    return string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase)
//        ? VaultType.OnPrem
//        : VaultType.Azure;
//}

static void ApplyFrontendRuntimeSettings(IConfiguration configuration, string webRootPath, string blocksKey, string googleSiteKey)
{
    //  var envFilePath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
    //var section = configuration.GetSection("FrontendRuntime");
    //var replacements = new Dictionary<string, string?>
    //{
    //    ["__BLOCKS_API_BASE_URL__"] = section["BLOCKS_API_BASE_URL"],
    //    ["__BLOCKS_X_BLOCKS_KEY__"] = section["BLOCKS_X_BLOCKS_KEY"],
    //    ["__BLOCKS_GOOGLE_SITE_KEY__"] = section["BLOCKS_GOOGLE_SITE_KEY"],
    //    ["__BLOCKS_CONSTRUCT_URL__"] = section["BLOCKS_CONSTRUCT_URL"]
    //};

    DotNetEnv.Env.Load();

    // blocksKey = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BLOCKS_X_BLOCKS_KEY")) ? Environment.GetEnvironmentVariable("BLOCKS_X_BLOCKS_KEY") : blocksKey;
    // googleSiteKey = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BLOCKS_GOOGLE_SITE_KEY")) ? Environment.GetEnvironmentVariable("BLOCKS_GOOGLE_SITE_KEY") : googleSiteKey;

    var replacements = new Dictionary<string, string?>
    {
        ["__BLOCKS_API_BASE_URL__"] = Environment.GetEnvironmentVariable("BLOCKS_API_BASE_URL"),
        ["__BLOCKS_X_BLOCKS_KEY__"] = Environment.GetEnvironmentVariable("BLOCKS_X_BLOCKS_KEY"),
        ["__BLOCKS_GOOGLE_SITE_KEY__"] = Environment.GetEnvironmentVariable("BLOCKS_GOOGLE_SITE_KEY"),
        ["__BLOCKS_CONSTRUCT_URL__"] = Environment.GetEnvironmentVariable("BLOCKS_CONSTRUCT_URL"),
        ["__BLOCKS_OIDC_CLIENT_ID__"] = Environment.GetEnvironmentVariable("BLOCKS_OIDC_CLIENT_ID"),
        ["__BLOCKS_LOGIC_BASE_URL__"] = Environment.GetEnvironmentVariable("BLOCKS_LOGIC_BASE_URL"),
        ["__BLOCKS_IDP_BASE_URL__"] = Environment.GetEnvironmentVariable("BLOCKS_IDP_BASE_URL"),
    };


    var files = Directory.EnumerateFiles(webRootPath, "*", SearchOption.AllDirectories)
        .Where(path =>
        {
            var ext = Path.GetExtension(path);
            return ext.Equals(".html", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".js", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".css", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".json", StringComparison.OrdinalIgnoreCase);
        });

    foreach (var filePath in files)
    {
        var content = File.ReadAllText(filePath);
        var updated = content;

        foreach (var (token, value) in replacements)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                updated = updated.Replace(token, value, StringComparison.Ordinal);
            }
        }

        if (!ReferenceEquals(content, updated) && !content.Equals(updated, StringComparison.Ordinal))
        {
            File.WriteAllText(filePath, updated);
        }
    }
}
