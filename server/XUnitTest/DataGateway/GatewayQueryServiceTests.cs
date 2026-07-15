using DataGateway.DomainService.Exceptions;
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
public class GatewayQueryServiceTests
{
    private readonly Mock<IGqlDbRepository> _repo = new();
    private readonly GatewayQueryService _service;

    public GatewayQueryServiceTests()
    {
        _service = new GatewayQueryService(_repo.Object, Mock.Of<ILogger<GatewayQueryService>>());
    }

    private static BsonDocument? ExtractDoc(FilterDefinition<BsonDocument> filter)
    {
        var rendered = filter.Render(new RenderArgs<BsonDocument>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry));
        return rendered;
    }

    [Fact]
    public async Task QueryAsync_ReturnsItemsAndCount()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var docs = new List<BsonDocument>
            {
                new BsonDocument { { "_id", "1" }, { "Name", "John" } },
                new BsonDocument { { "_id", "2" }, { "Name", "Jane" } }
            };
            _repo.Setup(r => r.GetItemsWithCountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync((docs, 5L));

            var schema = Schema(fields: new() { Field("Name") });
            var request = new GatewayQueryRequest { Page = 1, PerPage = 2 };

            var result = await _service.QueryAsync(request, schema);

            result.Items.Should().HaveCount(2);
            result.TotalCount.Should().Be(5);
            result.PageNo.Should().Be(1);
            result.PageSize.Should().Be(2);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_CustomSchema_NoRlsPolicies_DeniesAccess()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });
            var act = () => _service.QueryAsync(new GatewayQueryRequest(), schema);
            await act.Should().ThrowAsync<AccessDeniedException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_CustomSchema_WithRlsPolicy_AppliesDataFilter()
    {
        ClearContext();
        SetBlocksCloud(false);
        SetContext(isAuthenticated: true);
        try
        {
            FilterDefinition<BsonDocument>? captured = null;
            _repo.Setup(r => r.GetItemsWithCountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .Callback<string, FilterDefinition<BsonDocument>, BsonDocument?, BsonDocument?, int, int>(
                    (_, f, _, _, _, _) => captured = f)
                .ReturnsAsync((new List<BsonDocument>(), 0L));

            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });
            schema.Policies.Add(Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, staticValue: "u-1"))));

            await _service.QueryAsync(new GatewayQueryRequest(), schema);

            var doc = ExtractDoc(captured!);
            doc!.Contains("CreatedBy").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task QueryAsync_AppliesWhereFilterAndPagination()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            FilterDefinition<BsonDocument>? captured = null;
            int capturedSkip = -1, capturedLimit = -1;
            _repo.Setup(r => r.GetItemsWithCountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .Callback<string, FilterDefinition<BsonDocument>, BsonDocument?, BsonDocument?, int, int>(
                    (_, f, _, _, skip, limit) => { captured = f; capturedSkip = skip; capturedLimit = limit; })
                .ReturnsAsync((new List<BsonDocument>(), 0L));

            var schema = Schema(fields: new() { Field("Name") });
            var request = new GatewayQueryRequest
            {
                Where = new Dictionary<string, object?> { ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" } },
                Page = 3,
                PerPage = 10
            };

            await _service.QueryAsync(request, schema);

            ExtractDoc(captured!)!.Contains("Name").Should().BeTrue();
            capturedSkip.Should().Be(20); // (3-1)*10
            capturedLimit.Should().Be(10);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetByIdAsync_Found_ReturnsRecord()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument> { new BsonDocument { { "_id", "1" }, { "Name", "John" } } });

            var schema = Schema(fields: new() { Field("Name") });
            var result = await _service.GetByIdAsync("1", null, schema);

            result.Should().NotBeNull();
            result!["Name"].Should().Be("John");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetByIdAsync_NotFound_ReturnsNull()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument>());

            var schema = Schema(fields: new() { Field("Name") });
            (await _service.GetByIdAsync("nope", null, schema)).Should().BeNull();
        }
        finally { ClearContext(); }
    }
}
