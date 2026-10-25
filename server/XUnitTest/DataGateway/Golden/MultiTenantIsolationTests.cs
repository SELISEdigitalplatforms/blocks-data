using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Golden;

/// <summary>
/// One gateway process serves every tenant at once. The total count now runs in its own field
/// resolver after the page is read, so it must still run against the tenant of the request it
/// belongs to while other tenants' requests run alongside it.
/// </summary>
[Collection("Mongo")]
public class MultiTenantCountIsolationTests
{
    private readonly DbRepository _repo;
    private readonly Mock<IGqlDbRepository> _gql = new();

    public MultiTenantCountIsolationTests(MongoFixture fixture)
    {
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);

        // Both reads answer with the tenant they ran for, after a random pause so that the
        // requests interleave and continue on other threads.
        _gql.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .Returns(async (string _, FilterDefinition<BsonDocument> _, BsonDocument _, BsonDocument _, int _, int _) =>
            {
                await Task.Delay(Random.Shared.Next(0, 5));
                var tenant = TenantContext.GetTenantId();
                return new List<BsonDocument> { new() { { "_id", tenant }, { "Title", tenant } } };
            });
        _gql.Setup(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .Returns(async (string _, FilterDefinition<BsonDocument> _) =>
            {
                await Task.Delay(Random.Shared.Next(0, 5));
                return CountFor(TenantContext.GetTenantId());
            });
    }

    [Fact]
    public async Task ConcurrentRequestsOfDifferentTenants_EachCountTheirOwnTenant()
    {
        var executor = await BuildExecutorAsync();
        var tenants = Enumerable.Range(0, 80).Select(i => $"tenant-{i % 5}").ToList();

        var responses = await Task.WhenAll(tenants.Select(tenant => Task.Run(async () =>
        {
            // What the gateway sets up for a request: the caller's token and the x-blocks-key.
            SetContext(tenantId: tenant, userId: $"user-of-{tenant}");
            RequestContextAccessor.Current = new RequestContext { TenantId = tenant, BlocksKey = tenant, IsRequestFromBlocksCloud = true };
            var result = await executor.ExecuteAsync("{ getProducts { items { Title } totalCount totalPages } }");
            return (Tenant: tenant, Result: result);
        })));

        foreach (var (tenant, result) in responses)
        {
            var operation = (IOperationResult)result;
            operation.Errors.Should().BeNullOrEmpty();
            var data = (IReadOnlyDictionary<string, object?>)operation.Data!["getProducts"]!;
            var items = (IReadOnlyList<object?>)data["items"]!;
            ((IReadOnlyDictionary<string, object?>)items[0]!)["Title"].Should().Be(tenant);
            data["totalCount"].Should().Be((int)CountFor(tenant), $"the count of a {tenant} request must be {tenant}'s");
        }
    }

    private static long CountFor(string tenant) => 100 + int.Parse(tenant["tenant-".Length..], System.Globalization.CultureInfo.InvariantCulture);

    private async Task<IRequestExecutor> BuildExecutorAsync()
    {
        await _repo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = Guid.NewGuid().ToString(),
                SchemaName = "Product",
                CollectionName = "Products",
                SchemaType = SchemaType.Entity,
                ReadAccessLevel = SchemaAccessLevel.Public,
                Fields = new() { new FieldDefinition { Name = "Title", Type = "String" } }
            }
        });

        var queryService = new QueryService(_gql.Object, Resolver(), Principals(), NullLogger<QueryService>.Instance);
        var schemaBuilder = new GraphqlSchemaBuilder(
            new SchemaResolver(new Mock<IMutationService>().Object, queryService), _repo, NullLogger<GraphqlSchemaBuilder>.Instance);

        var http = new DefaultHttpContext();
        http.Request.Headers["x-blocks-key"] = "tenant";
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(http);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(accessor.Object);
        services.AddGraphQLServer()
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)));
        var provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();
    }
}
