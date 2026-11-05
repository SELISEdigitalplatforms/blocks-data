using DataGateway.Rest;
using FluentAssertions;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// <see cref="RestRouteNames.OperationFor"/> names the operation a method and path would have run, in the request
/// log's GraphQL-style names (spec 2026-11-04 §2 and §4): the entry a request that is refused before any action runs
/// (a wrong content type) is logged under.
/// </summary>
public class RestRouteNamesTests
{
    [Theory]
    [InlineData("GET", "/api/gateway/E", "getEs")]
    [InlineData("GET", "/api/gateway/E/i1", "getEById")]
    [InlineData("POST", "/api/gateway/E", "insertE")]
    [InlineData("PATCH", "/api/gateway/E/i1", "updateE")]
    [InlineData("PUT", "/api/gateway/E/i1", "upsertE")]
    [InlineData("DELETE", "/api/gateway/E/i1", "deleteE")]
    [InlineData("POST", "/api/gateway/E:query", "getEs")]
    [InlineData("POST", "/api/gateway/E:insertMany", "insertManyE")]
    [InlineData("POST", "/api/gateway/E:updateMany", "updateManyE")]
    [InlineData("POST", "/api/gateway/E:deleteMany", "deleteManyE")]
    public void EachRoute_IsNamedAsTheOperationItRuns(string method, string path, string name)
    {
        RestRouteNames.OperationFor(method, path).Should().Be(name);
    }

    [Theory]
    [InlineData("post", "/API/Gateway/E:deleteMany", "deleteManyE")]
    [InlineData("POST", "/api/gateway/E%3AdeleteMany", "deleteManyE")]
    [InlineData("POST", "/api/gateway/E%3aquery", "getEs")]
    [InlineData("POST", "/api/gateway/E/", "insertE")]
    public void MethodAndPathCase_AndEncodedColon_AreAsRoutingReadsThem(string method, string path, string name)
    {
        RestRouteNames.OperationFor(method, path).Should().Be(name);
    }

    [Theory]
    [InlineData("POST", "/api/gateway/E:DeleteMany", "unknownE")]
    [InlineData("POST", "/api/gateway/E:nope", "unknownE")]
    [InlineData("POST", "/api/gateway/E:", "unknownE")]
    [InlineData("GET", "/api/gateway/E:query", "unknownE")]
    [InlineData("PATCH", "/api/gateway/E", "unknownE")]
    [InlineData("DELETE", "/api/gateway/E", "unknownE")]
    [InlineData("POST", "/api/gateway/E/i1", "unknownE")]
    [InlineData("GET", "/api/gateway/E/i1/item", "unknownE")]
    [InlineData("PATCH", "/api/gateway/E:updateMany", "unknownE")]
    public void ARouteThatDoesNotExist_IsUnknownWithTheEntity(string method, string path, string name)
    {
        RestRouteNames.OperationFor(method, path).Should().Be(name);
    }

    [Theory]
    [InlineData("POST", "/api/gateway/bad-name!")]
    [InlineData("POST", "/api/gateway/bad-name!:query")]
    [InlineData("POST", "/api/gateway/1Starts")]
    [InlineData("POST", "/api/gateway")]
    [InlineData("POST", "/api/gateway/")]
    [InlineData("POST", "/api/other/E")]
    public void WithoutAValidEntity_TheNameCarriesNone(string method, string path)
    {
        RestRouteNames.OperationFor(method, path).Should().Be("unknown");
    }

    [Theory]
    [InlineData("/api/gateway/E", "E")]
    [InlineData("/api/gateway/E/i1", "E")]
    [InlineData("/api/gateway/E:query", "E")]
    [InlineData("/api/gateway/E%3Aquery", "E")]
    [InlineData("/api/gateway/_Person_2/x", "_Person_2")]
    [InlineData("/api/gateway/bad-name!", null)]
    [InlineData("/api/gateway/bad-name!:query", null)]
    [InlineData("/api/gateway/1Starts", null)]
    [InlineData("/api/gateway", null)]
    [InlineData("/api/gateway/", null)]
    [InlineData("/api/elsewhere/E", null)]
    public void Entity_IsReadOnlyWhenItPassesTheSchemaNameRule(string path, string? entity)
    {
        RestRouteNames.EntityFor(path).Should().Be(entity);
    }

    [Fact]
    public void Entity_OfFiftyOneCharacters_IsNone()
    {
        RestRouteNames.EntityFor($"/api/gateway/{new string('A', 51)}").Should().BeNull();
    }

    [Theory]
    [InlineData(RestOperation.Get, "getPersons")]
    [InlineData(RestOperation.GetById, "getPersonById")]
    [InlineData(RestOperation.Insert, "insertPerson")]
    [InlineData(RestOperation.InsertMany, "insertManyPerson")]
    [InlineData(RestOperation.Update, "updatePerson")]
    [InlineData(RestOperation.UpdateMany, "updateManyPerson")]
    [InlineData(RestOperation.Upsert, "upsertPerson")]
    [InlineData(RestOperation.Delete, "deletePerson")]
    [InlineData(RestOperation.DeleteMany, "deleteManyPerson")]
    public void OperationName_FollowsSpecSection4(RestOperation operation, string name)
    {
        RestRouteNames.OperationName(operation, "Person").Should().Be(name);
    }
}
