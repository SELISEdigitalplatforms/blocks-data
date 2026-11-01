using DataGateway.DomainService;
using FluentAssertions;

namespace XUnitTest.Architecture;

/// <summary>
/// The domain service holds the gateway engine only. The GraphQL surface (HotChocolate) lives in DataGateway.GraphQL,
/// so the domain service must not depend on HotChocolate.
/// </summary>
public class DomainServiceArchitectureTests
{
    [Fact]
    public void DomainService_ReferencesNoHotChocolate()
    {
        typeof(ServiceRegistry).Assembly.GetReferencedAssemblies()
            .Select(a => a.Name).Should().NotContain(n => n!.StartsWith("HotChocolate"));
    }
}
