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


public class ProjectServiceTests
{
    private readonly Mock<ITenants> _tenants = new();
    private readonly Mock<IDbRepository> _repo = new();
    private readonly ProjectService _service;

    public ProjectServiceTests()
    {
        _service = new ProjectService(_tenants.Object, _repo.Object, NullLogger<ProjectService>.Instance);
    }

    [Fact]
    public void Constructor_NullArgs_Throw()
    {
        Assert.Throws<ArgumentNullException>(() => new ProjectService(null!, _repo.Object, NullLogger<ProjectService>.Instance));
        Assert.Throws<ArgumentNullException>(() => new ProjectService(_tenants.Object, null!, NullLogger<ProjectService>.Instance));
        Assert.Throws<ArgumentNullException>(() => new ProjectService(_tenants.Object, _repo.Object, null!));
    }

    [Fact]
    public async Task GetTenants_NoFilter_ReturnsAll()
    {
        var doc = BlocksTestContext.Tenant("t1").ToBsonDocument();
        _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, It.IsAny<string>()))
            .ReturnsAsync(new List<BsonDocument> { doc });

        var result = await _service.GetTenantsAsync();

        result.Should().ContainSingle();
        result[0].TenantId.Should().Be("t1");
    }

    [Fact]
    public async Task GetTenantSlug_TenantMissing_ReturnsEmpty()
    {
        _tenants.Setup(t => t.GetTenantByID("t1")).Returns((Tenant?)null);

        var result = await _service.GetTenantSlugAsync("t1");

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTenantSlug_BlocksGuidMissing_ReturnsEmpty()
    {
        _tenants.Setup(t => t.GetTenantByID("t1")).Returns(BlocksTestContext.Tenant(tenantGroupId: "g1", environment: "dev"));
        _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync((BsonDocument?)null);

        var result = await _service.GetTenantSlugAsync("t1");

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTenantSlug_Found_ReturnsShortKey()
    {
        _tenants.Setup(t => t.GetTenantByID("t1")).Returns(BlocksTestContext.Tenant(tenantGroupId: "g1", environment: "dev"));
        _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync(new BsonDocument { { "EncodedValue", "abc" } });

        var result = await _service.GetTenantSlugAsync("t1");

        result.Should().Be("dabc");
    }

    [Fact]
    public async Task GetTenantId_BlocksGuidMissing_ReturnsEmpty()
    {
        _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync((BsonDocument?)null);

        var result = await _service.GetTenantIdAsync("dabc");

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTenantId_Found_ReturnsTenantId()
    {
        _repo.SetupSequence(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync(new BsonDocument { { "TenantGroupId", "g1" } })
            .ReturnsAsync(new BsonDocument { { "TenantId", "t1" } });

        var result = await _service.GetTenantIdAsync("dabc");

        result.Should().Be("t1");
    }
}

public class MockDataServiceTests
{
    private readonly Mock<IGqlDbRepository> _gql = new();
    private readonly Mock<IDbRepository> _repo = new();
    private readonly MockDataService _service;

    public MockDataServiceTests()
    {
        _service = new MockDataService(_gql.Object, _repo.Object);
    }

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

[Collection("ContextSerial")]
public class TenantHelperTests
{
    [Theory]
    [InlineData("dev", "d")]
    [InlineData("prod", "p")]
    [InlineData("unknown", "n")]
    [InlineData("", "n")]
    public void GetEnvShortKey_Maps(string env, string expected)
    {
        TenantHelper.GetEnvShortKey(env).Should().Be(expected);
    }

    [Theory]
    [InlineData("d", "dev")]
    [InlineData("p", "prod")]
    [InlineData("z", "")]
    [InlineData("", "")]
    public void GetEnvFromShortKey_Maps(string shortKey, string expected)
    {
        TenantHelper.GetEnvFromShortKey(shortKey).Should().Be(expected);
    }

    [Fact]
    public void GetAllMappings_ReturnExpectedCounts()
    {
        TenantHelper.GetAllEnvMappings().Should().ContainKey("dev");
        TenantHelper.GetAllShortKeyMappings().Should().ContainKey("d");
    }

    [Fact]
    public void GetProjectShortKey_Combines()
    {
        BlocksTestContext.Tenant(environment: "dev").GetProjectShortKey("abc").Should().Be("dabc");
        BlocksTestContext.Tenant(environment: "dev").GetProjectShortKey("").Should().BeEmpty();
    }

    [Theory]
    [InlineData("https://host/dabc/gateway", "dabc")]
    [InlineData("https://host/dabc/gateway?x=1", "dabc")]
    [InlineData("https://host/gateway", "")]
    [InlineData("not-a-uri", "")]
    public void GetTenantSlugFromRequestUri_Parses(string uri, string expected)
    {
        TenantHelper.GetTenantSlugFromRequestUri(uri).Should().Be(expected);
    }

    [Fact]
    public void GetProjectShortKeyFromRequestUri_UsesContext()
    {
        BlocksTestContext.Clear();
        TenantHelper.GetProjectShortKeyFromRequestUri().Should().BeEmpty();
    }
}
