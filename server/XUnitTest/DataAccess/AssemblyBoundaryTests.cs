using Blocks.DataAccess.Policies;
using FluentAssertions;

namespace XUnitTest.DataAccess;

/// <summary>
/// Blocks.DataAccess is meant to be referenced by any service, GraphQL or not. These tests pin that
/// boundary: the assembly must not pull in HotChocolate or the gateway it was extracted from.
/// </summary>
public class AssemblyBoundaryTests
{
    [Fact]
    public void BlocksDataAccess_ReferencesNeitherHotChocolateNorTheGateway()
    {
        var referenced = typeof(DataAccessPolicyResolver).Assembly
            .GetReferencedAssemblies()
            .Select(a => a.Name ?? string.Empty)
            .ToList();

        referenced.Should().NotContain(name => name.StartsWith("HotChocolate", StringComparison.Ordinal));
        referenced.Should().NotContain(name => name.StartsWith("DataGateway", StringComparison.Ordinal));
    }
}
