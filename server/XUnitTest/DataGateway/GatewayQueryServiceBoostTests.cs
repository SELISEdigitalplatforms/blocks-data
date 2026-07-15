using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

[Collection("ContextSerial")]
public class GatewayQueryServiceBoostTests
{
    private readonly Mock<IGqlDbRepository> _repo = new();
    private readonly GatewayQueryService _service;
    private BsonDocument? _capturedSort;

    public GatewayQueryServiceBoostTests()
    {
        _service = new GatewayQueryService(_repo.Object, Mock.Of<ILogger<GatewayQueryService>>());
        _repo.Setup(r => r.GetItemsWithCountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
            .Callback<string, FilterDefinition<BsonDocument>, BsonDocument?, BsonDocument?, int, int>(
                (_, _, sort, _, _, _) => _capturedSort = sort)
            .ReturnsAsync((new List<BsonDocument>(), 0L));
    }

    private static SchemaDefinitionExtended SortSchema() => Schema(fields: new()
    {
        Field("Name"), Field("Age", "Int")
    });

    [Fact]
    public async Task QueryAsync_TypedOrder_BuildsSort()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var request = new GatewayQueryRequest
            {
                Order = new List<object>
                {
                    new Dictionary<string, object?> { ["field"] = "Age", ["direction"] = "DESC" }
                }
            };
            await _service.QueryAsync(request, SortSchema());
            _capturedSort!["Age"].AsInt32.Should().Be(-1);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_PocketBaseSortString_CurrentlyThrows_KnownBug()
    {
        // KNOWN BUG: SortStringParser.Parse returns List<Dictionary<string, object?>>, but
        // OrderToMongoSortConverter.Convert only accepts IList<object>, so the parsed result is
        // discarded and the raw "-Name" string is (wrongly) fed to BsonSerializer as JSON, throwing.
        // This test characterizes the current behaviour; see GatewayQueryService.GetMongoSort.
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var request = new GatewayQueryRequest { Sort = "-Name" };
            var act = () => _service.QueryAsync(request, SortSchema());
            await act.Should().ThrowAsync<FormatException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_JsonSortString_Parsed()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var request = new GatewayQueryRequest { Sort = "{\"Age\": 1}" };
            await _service.QueryAsync(request, SortSchema());
            _capturedSort!.Contains("Age").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_NonCloud_AppliesClsMaskingToItems()
    {
        ClearContext();
        SetBlocksCloud(false);
        SetContext(isAuthenticated: true);
        try
        {
            _repo.Setup(r => r.GetItemsWithCountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync((new List<BsonDocument> { new BsonDocument { { "_id", "1" }, { "Name", "John" } } }, 1L));

            // Public read schema => RLS granted (not custom); CLS masking path still runs (non-cloud)
            var result = await _service.QueryAsync(new GatewayQueryRequest(), SortSchema());

            result.Items.Should().HaveCount(1);
            result.Items[0]["Name"].Should().Be("John");
        }
        finally { ClearContext(); }
    }
}
