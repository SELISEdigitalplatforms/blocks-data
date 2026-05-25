using DataGateway.DomainService;
using DataGateway.Driver;
using Microsoft.Extensions.DependencyInjection;

namespace Blocks.Extension.DependencyInjection;

public static class DataGatewayDriverServiceExtention
{
    public static void RegisterBlocksDataGateway(this IServiceCollection services)
    {
        services.AddSingleton<IDataGatewayDriverService, DataGatewayDriverService>();
        services.RegisterSchemaServices();
    }

}
