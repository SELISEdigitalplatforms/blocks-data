using Blocks.DataAccess.Policies;
using Microsoft.Extensions.DependencyInjection;

namespace Blocks.DataAccess;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the DataAccessPolicy resolver. The host must also register an
    /// <see cref="IAccessPrincipalAccessor"/>, since only the host knows where its request state lives.
    /// </summary>
    public static IServiceCollection AddBlocksDataAccess(this IServiceCollection services)
    {
        services.AddSingleton<IAccessPolicySource, SchemaPolicySource>();
        services.AddSingleton<IDataAccessPolicyResolver, DataAccessPolicyResolver>();
        services.AddSingleton<IDataAccessResolver, DataAccessResolver>();   // by schema name; needs Genesis' IDbContextProvider
        return services;
    }
}
