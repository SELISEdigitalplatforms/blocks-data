using System.Reflection;
using Api.Controllers;
using Blocks.Genesis;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Storage.DomainService.Storage.ZipDownload;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// The zip services are unit tested with mocks, so nothing else proves the real container can
/// build them. Every constructor dependency must be registered by AddStorageDomainServices,
/// apart from the services the host and Genesis provide.
/// </summary>
public class ZipDownloadRegistrationTests
{
    private static readonly Type[] ProvidedByHost = [typeof(ICacheClient)];

    public static TheoryData<Type> ZipTypes() => new()
    {
        typeof(ZipDownloadService),
        typeof(ZipTicketStore),
        typeof(ZipDownloadController),
    };

    [Theory]
    [MemberData(nameof(ZipTypes))]
    public void Every_constructor_dependency_is_registered(Type type)
    {
        var services = new ServiceCollection();
        services.AddStorageDomainServices();
        var registered = services.Select(d => d.ServiceType).ToHashSet();

        var unregistered = type.GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Single()
            .GetParameters()
            .Select(p => p.ParameterType)
            .Where(t => !registered.Contains(t)
                && !ProvidedByHost.Contains(t)
                && !(t.IsGenericType && t.GetGenericTypeDefinition() == typeof(ILogger<>)));

        unregistered.Should().BeEmpty($"{type.Name} must be constructible from the real container");
    }

    [Fact]
    public void Zip_services_are_registered()
    {
        var services = new ServiceCollection();
        services.AddStorageDomainServices();

        services.Should().Contain(d => d.ServiceType == typeof(IZipDownloadService) && d.ImplementationType == typeof(ZipDownloadService));
        services.Should().Contain(d => d.ServiceType == typeof(IZipTicketStore) && d.ImplementationType == typeof(ZipTicketStore));
    }
}
