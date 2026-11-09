using BlocksTemplate.Api;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace XUnitTest.Api;

public class FrontendRuntimeValuesTests
{
    private static IConfiguration Build(string? value)
    {
        var data = new Dictionary<string, string?>();
        if (value is not null)
        {
            data[FrontendRuntimeValues.GraphQLDeprecatedSinceKey] = value;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(data).Build();
    }

    [Fact]
    public void GraphQLDeprecatedSinceKey_IsTheDataGatewayGraphQLSetting()
    {
        FrontendRuntimeValues.GraphQLDeprecatedSinceKey.Should().Be("DataGateway:GraphQL:DeprecatedSince");
    }

    [Fact]
    public void GraphQLDeprecatedSince_ReturnsTheConfiguredValue()
    {
        FrontendRuntimeValues.GraphQLDeprecatedSince(Build("2026-12-01")).Should().Be("2026-12-01");
    }

    [Fact]
    public void GraphQLDeprecatedSince_TrimsSurroundingWhitespace()
    {
        FrontendRuntimeValues.GraphQLDeprecatedSince(Build("  2026-12-01 ")).Should().Be("2026-12-01");
    }

    [Fact]
    public void GraphQLDeprecatedSince_ReturnsNullWhenUnset()
    {
        FrontendRuntimeValues.GraphQLDeprecatedSince(Build(null)).Should().BeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void GraphQLDeprecatedSince_ReturnsNullWhenBlank(string value)
    {
        FrontendRuntimeValues.GraphQLDeprecatedSince(Build(value)).Should().BeNull();
    }
}
