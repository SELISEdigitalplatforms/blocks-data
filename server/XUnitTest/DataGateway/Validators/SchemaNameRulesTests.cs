using DataGateway.DomainService.Validators;
using FluentAssertions;

namespace XUnitTest.DataGateway.Validators;

/// <summary>The one rule a schema name must follow, shared by schema creation and the REST route.</summary>
public class SchemaNameRulesTests
{
    [Theory]
    [InlineData("Person")]
    [InlineData("_internal")]
    [InlineData("A")]
    [InlineData("Order_2024")]
    public void IsValid_AcceptsNamesSchemasCanHave(string name) => SchemaNameRules.IsValid(name).Should().BeTrue();

    [Fact]
    public void IsValid_AcceptsFiftyCharacters() => SchemaNameRules.IsValid(new string('A', 50)).Should().BeTrue();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1Person")]
    [InlineData("Bad-Name")]
    [InlineData("has space")]
    [InlineData("a.b")]
    [InlineData("Person\n")]
    public void IsValid_RefusesWhatNoSchemaCanBeNamed(string? name) => SchemaNameRules.IsValid(name).Should().BeFalse();

    [Fact]
    public void IsValid_RefusesFiftyOneCharacters() => SchemaNameRules.IsValid(new string('A', 51)).Should().BeFalse();
}
