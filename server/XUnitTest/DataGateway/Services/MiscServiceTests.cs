using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class SchemaChangeLogServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly SchemaChangeLogService _service;

    public SchemaChangeLogServiceTests()
    {
        BlocksTestContext.Set();
        _service = new SchemaChangeLogService(_repo.Object, NullLogger<SchemaChangeLogService>.Instance);
    }

    [Fact]
    public void Constructor_NullArgs_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaChangeLogService(null!, NullLogger<SchemaChangeLogService>.Instance));
        Assert.Throws<ArgumentNullException>(() => new SchemaChangeLogService(_repo.Object, null!));
    }

    [Fact]
    public async Task Create_InsertsLog()
    {
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaChangeLog>(), "")).ReturnsAsync((SchemaChangeLog l, string _) => l);

        var result = await _service.CreateSchemaChangeLogAsync("s1", SchemaChangeType.SchemaCreate);

        result.Should().NotBeNull();
        result!.SchemaId.Should().Be("s1");
        result.ChangeType.Should().Be(SchemaChangeType.SchemaCreate);
        result.ItemId.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Create_OnException_ReturnsNull()
    {
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaChangeLog>(), "")).ThrowsAsync(new Exception("boom"));

        var result = await _service.CreateSchemaChangeLogAsync("s1", SchemaChangeType.SchemaCreate);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetUnadapted_ReturnsItems()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(
                It.IsAny<FilterDefinition<SchemaChangeLog>>(), null, ""))
            .ReturnsAsync(new List<SchemaChangeLog> { new() { ItemId = "1" } });

        var result = await _service.GetUnadaptedSchemaChangeLogsAsync();

        result.IsSuccess.Should().BeTrue();
        result.Data!.Should().ContainSingle();
    }

    [Fact]
    public async Task GetUnadapted_OnException_ReturnsError()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(
                It.IsAny<FilterDefinition<SchemaChangeLog>>(), null, ""))
            .ThrowsAsync(new Exception("boom"));

        var result = await _service.GetUnadaptedSchemaChangeLogsAsync();

        result.IsSuccess.Should().BeFalse();
    }
}


[Collection("ContextSerial")]
public sealed class MockDataServiceTests : IDisposable
{
    private readonly Mock<IGqlDbRepository> _gql = new();
    private readonly Mock<IDbRepository> _repo = new();
    private readonly RecordingLoggerProvider _logs = new();
    private readonly MockDataService _service;
    // Each GetCollectionsDataCount call's map, copied when it is made.
    private readonly List<Dictionary<string, string>> _countCalls = [];

    public MockDataServiceTests()
    {
        BlocksTestContext.Set(tenantId: "tenant-a");
        _service = new MockDataService(_gql.Object, _repo.Object, _logs.CreateLogger<MockDataService>());
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        _logs.Dispose();
        GC.SuppressFinalize(this);
    }

    private List<RecordedLog> Warnings => _logs.Logs.Where(l => l.Level == LogLevel.Warning).ToList();

    private static BsonDocument Schema(string? collectionName, string? schemaName, string? id = null)
    {
        var doc = new BsonDocument { { "_id", id ?? Guid.NewGuid().ToString() } };
        if (collectionName is not null) doc.Add("CollectionName", collectionName);
        if (schemaName is not null) doc.Add("SchemaName", schemaName);
        return doc;
    }

    private void GivenSchemas(params BsonDocument[] schemas) =>
        _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync(schemas.ToList());

    /// <summary>Every collection in a call has <paramref name="count"/> test documents; the result keeps the repository's swap.</summary>
    private void GivenEveryCollectionCounts(long count) =>
        _gql.Setup(g => g.GetCollectionsDataCount(It.IsAny<Dictionary<string, string>>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync((Dictionary<string, string> map, FilterDefinition<BsonDocument>? _) =>
            {
                _countCalls.Add(new Dictionary<string, string>(map));
                return map.Select(pair => new CollectionsDataCount { CollectionName = pair.Value, SchemaName = pair.Key, Count = count }).ToList();
            });

    [Fact]
    public async Task GetMockData_ReturnsCounts()
    {
        _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync(new List<BsonDocument>
            {
                new() { { "CollectionName", "Persons" }, { "SchemaName", "Person" } }
            });
        _gql.Setup(g => g.GetCollectionsDataCount(It.IsAny<Dictionary<string, string>>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync(new List<CollectionsDataCount> { new() { CollectionName = "Persons", SchemaName = "Person", Count = 5 } });

        var result = await _service.GetMockData();

        result.IsSuccess.Should().BeTrue();
        result.Data!.Items.Should().ContainSingle();
    }

    [Fact]
    public async Task GetMockData_ReadsEveryEntitySchemaOnce_WithoutRowCap_AndSkipsDeletedAndSystem()
    {
        GivenSchemas(Schema("Persons", "Person"));
        GivenEveryCollectionCounts(1);
        FilterDefinition<BsonDocument>? filter = null;
        _repo.Setup(r => r.GetItemsAsync("SchemaDefinitions", It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), 0, 0, It.IsAny<string>()))
            .Callback((string _, FilterDefinition<BsonDocument> f, BsonDocument? _, BsonDocument? _, int _, int _, string _) => filter = f)
            .ReturnsAsync([Schema("Persons", "Person")]);

        await _service.GetMockData();

        _repo.Verify(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
            It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()), Times.Once);
        var rendered = filter!.Render(new RenderArgs<BsonDocument>(MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry));
        // C5: a missing IsDeleted counts as not deleted, so the filter is $ne true, never == false.
        rendered.ToString().Should().Contain("\"IsDeleted\" : { \"$ne\" : true }")
            .And.Contain("\"IsSystemEntity\" : { \"$ne\" : true }")
            .And.Contain("\"SchemaType\" : 1");
    }

    [Fact]
    public async Task GetMockData_DistinctCollections_ReturnsSameItemsAndFieldSwap()
    {
        GivenSchemas(Schema("sb_Orders", "Order"), Schema("sb_Tags", "Tag"));
        GivenEveryCollectionCounts(2);

        var result = await _service.GetMockData();

        result.Message.Should().Be("Test Data Retrieved Successfully");
        result.Data!.Items.Should().BeEquivalentTo(new[]
        {
            new CollectionsDataCount { SchemaName = "sb_Orders", CollectionName = "Order", Count = 2 },
            new CollectionsDataCount { SchemaName = "sb_Tags", CollectionName = "Tag", Count = 2 },
        });
        Warnings.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMockData_DuplicatedCollection_ReturnsOneItemWithSortedNames_AndLogsOneWarning()
    {
        // E4: two schemas share blx_Currencys exactly; today's ToDictionary threw ArgumentException here.
        GivenSchemas(Schema("blx_Currencys", "CurrencyLegacy", "id-2"), Schema("blx_Currencys", "Currency", "id-1"), Schema("sb_Orders", "Order"));
        GivenEveryCollectionCounts(3);

        var result = await _service.GetMockData();

        result.IsSuccess.Should().BeTrue();
        result.Data!.Items.Should().HaveCount(2);
        result.Data.Items.Should().ContainSingle(i => i.SchemaName == "blx_Currencys")
            .Which.CollectionName.Should().Be("Currency, CurrencyLegacy");
        // H9: one warning per group per request, with tenant id, collection name and schema ids only.
        var warning = Warnings.Should().ContainSingle().Subject;
        warning.Field("CollectionName").Should().Be("blx_Currencys");
        warning.Field("TenantId").Should().Be("tenant-a");
        warning.Field("SchemaIds").Should().BeAssignableTo<IEnumerable<string>>().Which.Should().BeEquivalentTo("id-2", "id-1");
        warning.AllText().Should().NotContain("CurrencyLegacy");
    }

    [Fact]
    public async Task GetMockData_CollectionNamesDifferingOnlyByCase_StayTwoItems()
    {
        // MongoDB collection names are case-sensitive: grouping is ordinal, one item per physical collection.
        GivenSchemas(Schema("sb_Tags", "Tag"), Schema("SB_tags", "TagUpper"));
        GivenEveryCollectionCounts(1);

        var result = await _service.GetMockData();

        result.Data!.Items.Select(i => i.SchemaName).Should().BeEquivalentTo("sb_Tags", "SB_tags");
        Warnings.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMockData_MissingNullOrBlankCollectionName_IsSkipped()
    {
        GivenSchemas(
            Schema(null, "NoCollection"),
            new BsonDocument { { "_id", "n" }, { "CollectionName", BsonNull.Value }, { "SchemaName", "NullCollection" } },
            Schema("   ", "Blank"),
            Schema("", "Empty"),
            Schema("sb_Orders", "Order"));
        GivenEveryCollectionCounts(1);

        var result = await _service.GetMockData();

        result.Data!.Items.Should().ContainSingle().Which.SchemaName.Should().Be("sb_Orders");
    }

    [Fact]
    public async Task GetMockData_NoSchemas_ReturnsEmptyItems_WithoutCounting()
    {
        GivenSchemas();
        GivenEveryCollectionCounts(1);

        var result = await _service.GetMockData();

        result.IsSuccess.Should().BeTrue();
        result.Data!.Items.Should().BeEmpty();
        _countCalls.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMockData_OnlyCollectionsWithTestDataAreReturned()
    {
        GivenSchemas(Schema("sb_Orders", "Order"), Schema("sb_Tags", "Tag"));
        _gql.Setup(g => g.GetCollectionsDataCount(It.IsAny<Dictionary<string, string>>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync([new CollectionsDataCount { SchemaName = "sb_Tags", CollectionName = "Tag", Count = 4 }]);

        var result = await _service.GetMockData();

        result.Data!.Items.Should().ContainSingle().Which.SchemaName.Should().Be("sb_Tags");
    }

    [Theory]
    [InlineData(1000, 4)]
    [InlineData(450, 2)]
    [InlineData(300, 1)]
    [InlineData(301, 2)]
    public async Task GetMockData_CountsInBatchesOfAtMost300Collections(int schemaCount, int expectedCalls)
    {
        // C11 / E8: one SchemaDefinitions read, ceil(n / 300) count calls, each collection in exactly one batch.
        GivenSchemas(Enumerable.Range(0, schemaCount).Select(i => Schema($"sb_C{i}", $"S{i}")).ToArray());
        GivenEveryCollectionCounts(1);

        var result = await _service.GetMockData();

        _repo.Verify(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
            It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()), Times.Once);
        _countCalls.Should().HaveCount(expectedCalls);
        _countCalls.Should().OnlyContain(call => call.Count <= 300);
        var counted = _countCalls.SelectMany(call => call.Keys).ToList();
        counted.Should().OnlyHaveUniqueItems().And.HaveCount(schemaCount);
        result.Data!.Items.Should().HaveCount(schemaCount);
        result.Data.Items.Select(i => i.SchemaName).Should().BeEquivalentTo(Enumerable.Range(0, schemaCount).Select(i => $"sb_C{i}"));
    }

    [Fact]
    public async Task DeleteMockData_AggregatesResults()
    {
        _gql.Setup(g => g.DeleteManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 3 });

        var result = await _service.DeleteMockData(new DeleteMockDataRequest { SchemaNames = new List<string> { "Persons", "Cars" } });

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalImpactedData.Should().Be(6);
        result.Data.Acknowledged.Should().BeTrue();
    }
}
