using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// DataGatewayConfigurationService (data SPEC1 §3.5.6) on a real throwaway Mongo (tenant DB + root DB), a real
/// DbRepository behind a forwarding mock (for fault injection), a real DataSourceSecretResolver and an in-memory
/// secret service. Covers H5/H6, C12, C18, C19, C26, C56, C62, C64, C67 and R-CFG-*.
/// </summary>
[Collection("Mongo")]
public class DataGatewayConfigurationServiceTests
{
    private const string Tenant = "tenant-a";
    private const string ProjectKey = "tenant-a";
    private const string CopyId = "copy-1";
    private const string Custom = "mongodb://user:S3cr3tPass@byo-host:27017/?authSource=admin";
    private const string Custom2 = "mongodb://user:OtherPass@byo-host2:27017/";

    private readonly IMongoDatabase _tenantDb;
    private readonly IMongoDatabase _rootDb;
    private readonly DbRepository _realRepo;
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<ICacheClient> _cache = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<IProjectService> _project = new();
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();
    private readonly List<string> _sequence = new();

    public DataGatewayConfigurationServiceTests(MongoFixture fixture)
    {
        _tenantDb = fixture.CreateDatabase();
        _rootDb = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_tenantDb);
        provider.Setup(p => p.GetDatabase("root-cs", "BlocksRootDb", It.IsAny<bool>())).Returns(_rootDb);
        var blocksSecret = new Mock<IBlocksSecret>();
        blocksSecret.Setup(s => s.DatabaseConnectionString).Returns("root-cs");
        blocksSecret.Setup(s => s.RootDatabaseName).Returns("BlocksRootDb");
        _realRepo = new DbRepository(provider.Object, blocksSecret.Object);

        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataServiceConfiguration>>(), It.IsAny<string>()))
            .Returns((FilterDefinition<DataServiceConfiguration> f, string db) => _realRepo.GetItemAsync(f, db));
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataServiceConfiguration>(), It.IsAny<string>()))
            .Returns((DataServiceConfiguration d, string db) => _realRepo.InsertAsync(d, db));
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, UpdateDefinition<BsonDocument> u, bool up, string db) =>
            {
                _sequence.Add("root-update");
                return _realRepo.FindOneAndUpdateAsync(c, f, u, up, db);
            });
        _repo.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, BsonDocument d, string db) =>
            {
                _sequence.Add("copy-update");
                return _realRepo.UpdateAsync(c, f, d, db);
            });

        _cache.Setup(c => c.KeyExistsAsync(It.IsAny<string>())).Callback(() => _sequence.Add("redis-exists")).ReturnsAsync(true);
        _cache.Setup(c => c.RemoveKeyAsync(It.IsAny<string>())).Callback(() => _sequence.Add("redis-remove")).ReturnsAsync(true);
        _cache.Setup(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()))
            .Callback(() => _sequence.Add("redis-addhash")).ReturnsAsync(true);

        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataGatewayConfigurationRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataGatewayConfigurationRequest>())).ReturnsAsync(new ValidationResult());
        _project.Setup(p => p.GetTenantSlugAsync(It.IsAny<string>())).ReturnsAsync("slug");

        _secrets.BeforeCall = (op, _) =>
        {
            _sequence.Add("secret-" + op);
            return Task.CompletedTask;
        };
    }

    private DataGatewayConfigurationService Service() =>
        new(_repo.Object, _cache.Object, _validator.Object, _project.Object, _secrets.Resolver(),
            _logs.CreateLogger<DataGatewayConfigurationService>());

    private static void AsAdmin(string tenant = Tenant) => BlocksTestContext.Set(userId: "admin-1", tenantId: tenant);

    private IMongoCollection<BsonDocument> RootColl => _rootDb.GetCollection<BsonDocument>("DataServiceConfigurations");
    private IMongoCollection<BsonDocument> CopyColl => _tenantDb.GetCollection<BsonDocument>("DataServiceConfigurations");

    private static string B64(string v) => Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(v));

    private async Task SeedCopyAsync(string value, DateTime? lastUpdated = null)
    {
        await CopyColl.InsertOneAsync(new BsonDocument
        {
            { "_id", CopyId }, { "DbConnectionString", B64(value) }, { "DatabaseName", "byo-db" }, { "IsDeleted", false },
            { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" },
            { "LastUpdatedDate", lastUpdated ?? DateTime.UtcNow.AddDays(-1) }
        });
    }

    private async Task SeedRootAsync(string? secretId, bool flagged = false, bool marker = true, string tenant = Tenant, string configItemId = CopyId,
        AnalyticsConfiguration? analytics = null)
    {
        var doc = new BsonDocument
        {
            { "_id", tenant }, { "ConfigItemId", configItemId }, { "DatabaseName", "byo-db" }, { "IsDeleted", false },
            { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" },
            { "LastUpdatedDate", DateTime.UtcNow.AddHours(-1) },
            { "DbConnectionSecretId", secretId is null ? BsonNull.Value : secretId }
        };
        if (marker) doc["MigratedFrom"] = "DataServiceConfigurations";
        if (flagged) doc["ValueChangedAfterDeploy"] = true;
        if (analytics is not null) doc["AnalyticsConfiguration"] = analytics.ToBsonDocument();
        await RootColl.InsertOneAsync(doc);
    }

    private Task<BsonDocument> RootAsync(string tenant = Tenant) => RootColl.Find(new BsonDocument("_id", tenant)).FirstAsync();

    private static UpdateDataGatewayConfigurationRequest UpdateReq(string value, string itemId = CopyId, string projectKey = ProjectKey) => new()
    {
        ItemId = itemId, ConnectionString = value, DatabaseName = "byo-db-2", ProjectKey = projectKey,
        IsCollectionNameEditable = true, CollectionNamePattern = "x_{SchemaName}"
    };

    private List<HashEntry[]> CapturedHashes()
    {
        var list = new List<HashEntry[]>();
        foreach (var inv in _cache.Invocations.Where(i => i.Method.Name == nameof(ICacheClient.AddHashValueAsync)))
            list.Add(((IEnumerable<HashEntry>)inv.Arguments[1]).ToArray());
        return list;
    }

    // ---------------- GET ----------------

    [Fact]
    public async Task Get_RootCustom_ReturnsDecodedValueAndConfigItemId_OneValueRead()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);

        var result = await Service().GetConfiguration(ProjectKey);

        result.IsSuccess.Should().BeTrue();
        result.Data!.DbConnectionString.Should().Be(Custom);
        result.Data.ItemId.Should().Be(CopyId);
        result.Data.DatabaseName.Should().Be("byo-db");
        result.Data.ProjectShortKey.Should().Be("slug");
        _secrets.ValueReads.Should().Be(1);
    }

    [Theory]
    [InlineData("default", "default")]
    [InlineData(null, "")]
    public async Task Get_RootDefaultOrBlank_NoSecretCall(string? secretId, string expected)
    {
        AsAdmin();
        await SeedRootAsync(secretId);

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.DbConnectionString.Should().Be(expected);
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Get_NoRootDoc_ReadsTheTenantCopyAsToday()
    {
        AsAdmin();
        await SeedCopyAsync(Custom);

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.DbConnectionString.Should().Be(Custom);
        result.Data.ItemId.Should().Be(CopyId);
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Get_Neither_ReturnsTodaysNotFound()
    {
        AsAdmin();
        var result = await Service().GetConfiguration(ProjectKey);
        result.IsSuccess.Should().BeFalse();
        result.Message.Should().Be("Data source not found.");
    }

    [Theory]
    [InlineData(SecretStatuses.Locked, "locked")]
    [InlineData(SecretStatuses.Deleted, "deleted")]
    public async Task Get_LockedOrDeletedSecret_Answers200WithEmptyValueAndWarns(string status, string state)
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom, status);
        await SeedRootAsync(s.Id);

        var result = await Service().GetConfiguration(ProjectKey);

        result.IsSuccess.Should().BeTrue();
        result.Data!.DbConnectionString.Should().BeEmpty();
        _secrets.ValueReads.Should().Be(0);
        _logs.Logs.Should().Contain(l => l.Level == LogLevel.Warning && l.Message.Contains("get-secret-unusable") && l.Message.Contains("state=" + state));
    }

    [Fact]
    public async Task Get_MissingSecret_And_MalformedId_Answer200Empty_StateMissing()
    {
        AsAdmin();
        await SeedRootAsync("not-a-32-hex-id");

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.DbConnectionString.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("state=missing"));
    }

    [Fact]
    public async Task Get_ActiveSecretWithVaultValueGone_Answers200Empty_StateValueMissing()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        s.Value = null;
        await SeedRootAsync(s.Id);

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.DbConnectionString.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("state=value-missing"));
    }

    [Fact]
    public async Task Get_VaultDown_ThrowsWithTheInnerExceptionsOwnMessage()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);
        _secrets.FailWith = new SecretVaultException("vault https://kv.example unreachable", "get", s.Id);

        var act = () => Service().GetConfiguration(ProjectKey);

        var ex = await act.Should().ThrowAsync<DataSourceUnavailableException>();
        ex.Which.Message.Should().Be("vault https://kv.example unreachable");
        ex.Which.Message.Should().NotContain("S3cr3tPass");
    }

    // ---------------- INSERT ----------------

    [Fact]
    public async Task Insert_Custom_CreatesServiceSecretAndRootDocWithoutValue_FlagSet_RedisHasNoValue()
    {
        AsAdmin();
        var result = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        { ItemId = "new-1", ConnectionString = Custom, DatabaseName = "db1", ProjectKey = ProjectKey });

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().Be("new-1");
        var secret = _secrets.Secrets.Values.Single();
        secret.Type.Should().Be(SecretTypes.Service);
        secret.Name.Should().Be("data-source-connection");
        secret.Tags.Should().Equal("data");
        secret.OrganizationId.Should().Be("default");
        secret.TenantId.Should().Be(Tenant);
        var root = await RootAsync();
        root.Contains("DbConnectionString").Should().BeFalse();
        root["ConfigItemId"].AsString.Should().Be("new-1");
        root["DbConnectionSecretId"].AsString.Should().Be(secret.Id);
        root["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
        root["AnalyticsConfiguration"]["EnableAnalytics"].AsBoolean.Should().BeTrue();
        (await CopyColl.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        var hash = CapturedHashes().Single();
        hash.Select(h => h.Name.ToString()).Should().BeEquivalentTo("DbConnectionSecretId", "DatabaseName", "Version");
        hash.Should().NotContain(h => h.Value.ToString().Contains("S3cr3tPass"));
        _cache.Verify(c => c.AddHashValueAsync(ProjectKey, It.IsAny<IEnumerable<HashEntry>>()), Times.Once);
    }

    [Fact]
    public async Task Insert_Default_NoSecret_SentinelAndFlag()
    {
        AsAdmin();
        await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        { ItemId = "new-1", ConnectionString = "default", DatabaseName = "db1", ProjectKey = ProjectKey });

        _secrets.Calls.Should().BeEmpty();
        var root = await RootAsync();
        root["DbConnectionSecretId"].AsString.Should().Be("default");
        root["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
    }

    [Theory]
    [InlineData("Default")]
    [InlineData("DEFAULT")]
    public async Task DefaultInAnyCase_IsTheSentinel_AsToday_NoSecret(string value)
    {
        AsAdmin();
        await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        { ItemId = "new-1", ConnectionString = value, DatabaseName = "db1", ProjectKey = ProjectKey });
        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be("default");

        await Service().UpdateConfiguration(UpdateReq(value, itemId: "new-1"));
        _secrets.Calls.Should().BeEmpty();
        (await Service().GetConfiguration(ProjectKey)).Data!.DbConnectionString.Should().Be("default");
    }

    [Fact]
    public async Task Update_CustomToDefaultInOtherCase_IsToDefault()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);

        await Service().UpdateConfiguration(UpdateReq("DEFAULT"));

        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be("default");
        s.Status.Should().Be(SecretStatuses.Active, "the old secret is kept (owner 2026-10-13)");
        _secrets.Calls.Should().NotContain(c => c.Op == "Set" || c.Op == "Delete");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Insert_BlankItemId_GetsANewGuid_AsToday(string itemId)
    {
        AsAdmin();
        var result = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        { ItemId = itemId, ConnectionString = "default", DatabaseName = "db1", ProjectKey = ProjectKey });

        Guid.TryParse(result.Data!.ItemId, out _).Should().BeTrue();
        (await RootAsync())["ConfigItemId"].AsString.Should().Be(result.Data.ItemId);
    }

    [Fact]
    public async Task Insert_RootDocOrLiveTenantCopyExists_TodaysAlreadyExistsError()
    {
        AsAdmin();
        await SeedRootAsync("default");
        var r1 = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest { ItemId = "other-id", ConnectionString = Custom, DatabaseName = "d", ProjectKey = ProjectKey });
        r1.Message.Should().Be("Data source with this ID already exists.");

        await RootColl.DeleteManyAsync(new BsonDocument());
        await SeedCopyAsync(Custom);
        var r2 = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest { ItemId = "other-id", ConnectionString = Custom, DatabaseName = "d", ProjectKey = ProjectKey });
        r2.Message.Should().Be("Data source with this ID already exists.");
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Insert_RootInsertFails_ErrorAsToday_SecretStays_NoCompensationDelete()
    {
        AsAdmin();
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataServiceConfiguration>(), GraphQlConstant.BlocksRootDbName))
            .ThrowsAsync(new InvalidOperationException("E11000 duplicate key"));

        var act = () => Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        { ItemId = "new-1", ConnectionString = Custom, DatabaseName = "db1", ProjectKey = ProjectKey });

        await act.Should().ThrowAsync<InvalidOperationException>();
        _secrets.Secrets.Should().HaveCount(1);
        _secrets.Calls.Should().NotContain(c => c.Op == "Delete");
        _cache.Verify(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()), Times.Never);
    }

    // ---------------- UPDATE ----------------

    [Fact]
    public async Task Update_NoRootDoc_Refused409_NothingWrittenAnywhere()
    {
        AsAdmin();
        await SeedCopyAsync(Custom);

        var result = await Service().UpdateConfiguration(UpdateReq(Custom2));

        result.HttpStatusCode.Should().Be(409);
        result.Message.Should().Be("Data source not migrated yet. Ask ops to run the data migration job.");
        _secrets.Calls.Should().BeEmpty();
        _repo.Verify(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()), Times.Never);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()), Times.Never);
        _repo.Verify(r => r.InsertAsync(It.IsAny<DataServiceConfiguration>(), It.IsAny<string>()), Times.Never);
        _cache.Verify(c => c.RemoveKeyAsync(It.IsAny<string>()), Times.Never);
        _cache.Verify(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()), Times.Never);
        (await CopyColl.Find(new BsonDocument()).FirstAsync())["DbConnectionString"].AsString.Should().Be(B64(Custom));
        _logs.Logs.Should().Contain(l => l.Message.Contains("update-refused-not-migrated"));
    }

    [Fact]
    public async Task Update_ConfigItemIdMismatch_Today404()
    {
        AsAdmin();
        await SeedRootAsync("default");
        var result = await Service().UpdateConfiguration(UpdateReq("default", itemId: "someone-else"));
        result.HttpStatusCode.Should().Be(404);
        _cache.Verify(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()), Times.Never);
    }

    [Fact]
    public async Task Update_SameValue_NoRotate_NoFlag_RedisVersionWritten_CopyValueUntouched_MarkerKept()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedCopyAsync(Custom);
        await SeedRootAsync(s.Id);

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.IsSuccess.Should().BeTrue();
        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set" || c.Op == "Delete");
        var root = await RootAsync();
        root.Contains("ValueChangedAfterDeploy").Should().BeFalse();
        root["MigratedFrom"].AsString.Should().Be("DataServiceConfigurations");
        root["DatabaseName"].AsString.Should().Be("byo-db-2");
        root.Contains("DbConnectionString").Should().BeFalse();
        var copy = await CopyColl.Find(new BsonDocument()).FirstAsync();
        copy["DbConnectionString"].AsString.Should().Be(B64(Custom));
        copy["DatabaseName"].AsString.Should().Be("byo-db-2");
        copy["CollectionNamePattern"].AsString.Should().Be("x_{SchemaName}");
        copy["LastUpdatedDate"].ToUniversalTime().Should().BeCloseTo(root["LastUpdatedDate"].ToUniversalTime(), TimeSpan.FromMilliseconds(5));
        CapturedHashes().Should().ContainSingle();
    }

    [Fact]
    public async Task Update_ValueDiffers_Rotates_FlagWrittenBeforeRotate()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);
        bool? flagAtRotate = null;
        _secrets.BeforeCall = async (op, _) =>
        {
            _sequence.Add("secret-" + op);
            if (op == "Rotate")
                flagAtRotate = (await RootAsync()).Contains("ValueChangedAfterDeploy");
        };

        await Service().UpdateConfiguration(UpdateReq(Custom2));

        s.Value.Should().Be(Custom2);
        flagAtRotate.Should().BeTrue();
        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be(s.Id);
        (await RootAsync())["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
    }

    [Fact]
    public async Task Update_ActiveButValueMissing_RotatesWithoutCompare()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        s.Value = null;
        await SeedRootAsync(s.Id);

        await Service().UpdateConfiguration(UpdateReq(Custom));

        _secrets.Calls.Should().Contain(c => c.Op == "Rotate");
        s.Value.Should().Be(Custom);
    }

    [Fact]
    public async Task Update_Locked_RotatesWithoutReadingTheValue()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom, SecretStatuses.Locked);
        await SeedRootAsync(s.Id);

        await Service().UpdateConfiguration(UpdateReq(Custom2));

        _secrets.Calls.Should().NotContain(c => c.Op == "GetValue");
        _secrets.Calls.Should().Contain(c => c.Op == "Rotate");
    }

    [Theory]
    [InlineData("deleted")]
    [InlineData("not-found")]
    [InlineData("malformed")]
    [InlineData("null")]
    [InlineData("default")]
    public async Task Update_CustomValue_DeletedMissingOrNoSecret_SetsANewSecret_NoDeleteOfOldId(string rootState)
    {
        AsAdmin();
        string? rootId = rootState switch
        {
            "deleted" => _secrets.Add(Tenant, Custom, SecretStatuses.Deleted).Id,
            "not-found" => Guid.NewGuid().ToString("N"),
            "malformed" => "bad id",
            "null" => null,
            _ => "default"
        };
        await SeedRootAsync(rootId);

        await Service().UpdateConfiguration(UpdateReq(Custom2));

        _secrets.Calls.Should().Contain(c => c.Op == "Set");
        _secrets.Calls.Should().NotContain(c => c.Op == "Delete");
        var newId = (await RootAsync())["DbConnectionSecretId"].AsString;
        newId.Should().NotBe(rootId ?? string.Empty);
        _secrets.Secrets[newId].Value.Should().Be(Custom2);
        (await RootAsync())["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
    }

    [Theory]
    [InlineData(SecretStatuses.Active)]
    [InlineData(SecretStatuses.Locked)]
    public async Task Update_CustomToDefault_KeepsTheOldSecret_NoSecretCallAtAll(string status)
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom, status);
        await SeedRootAsync(s.Id);

        var result = await Service().UpdateConfiguration(UpdateReq("default"));

        result.IsSuccess.Should().BeTrue();
        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be("default");
        (await RootAsync())["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
        s.Status.Should().Be(status, "owner 2026-10-13: no archive / soft delete on a switch to default");
        _secrets.Calls.Should().BeEmpty();
        CapturedHashes().Should().ContainSingle();
    }

    [Fact]
    public async Task Update_DefaultToDefault_NoSecretAction_NoFlag()
    {
        AsAdmin();
        await SeedRootAsync("default");
        await Service().UpdateConfiguration(UpdateReq("default"));
        _secrets.Calls.Should().BeEmpty();
        (await RootAsync()).Contains("ValueChangedAfterDeploy").Should().BeFalse();
    }

    [Fact]
    public async Task Update_SetAndDelete_SeeTheFlagFirst()
    {
        AsAdmin();
        await SeedRootAsync(null);
        var flagAtSet = false;
        _secrets.BeforeCall = async (op, _) =>
        {
            if (op == "Set") flagAtSet = (await RootAsync()).Contains("ValueChangedAfterDeploy");
        };
        await Service().UpdateConfiguration(UpdateReq(Custom));
        flagAtSet.Should().BeTrue();
    }

    [Fact]
    public async Task Update_SecretOkThenRootWriteThrows_FlagAlreadyStored_ResaveSameValueKeepsFlagAndWritesRedis()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);
        var calls = 0;
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, UpdateDefinition<BsonDocument> u, bool up, string db) =>
                ++calls == 2 ? throw new MongoException("root write failed") : _realRepo.FindOneAndUpdateAsync(c, f, u, up, db));

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom2));
        await act.Should().ThrowAsync<MongoException>();

        s.Value.Should().Be(Custom2);
        (await RootAsync())["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
        _cache.Verify(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()), Times.Never);

        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, UpdateDefinition<BsonDocument> u, bool up, string db) => _realRepo.FindOneAndUpdateAsync(c, f, u, up, db));
        var again = await Service().UpdateConfiguration(UpdateReq(Custom2));

        again.IsSuccess.Should().BeTrue();
        _secrets.Calls.Count(c => c.Op == "Rotate").Should().Be(1);
        (await RootAsync())["ValueChangedAfterDeploy"].AsBoolean.Should().BeTrue();
        (await RootAsync())["DatabaseName"].AsString.Should().Be("byo-db-2");
        CapturedHashes().Should().ContainSingle();
    }

    [Fact]
    public async Task Update_FlagWriteThrows_NoSecretCall()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedRootAsync(s.Id);
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .ThrowsAsync(new MongoException("flag write failed"));

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom2));
        await act.Should().ThrowAsync<MongoException>();

        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set" || c.Op == "Delete");
        s.Value.Should().Be(Custom);
    }

    [Fact]
    public async Task Update_TenantCopyUpdate_NonSecretFieldsOnly_NoUpsert()
    {
        AsAdmin();
        await SeedRootAsync("default");

        await Service().UpdateConfiguration(UpdateReq("default"));

        var copyCall = _repo.Invocations.Single(i => i.Method.Name == nameof(IDbRepository.UpdateAsync));
        var set = (BsonDocument)copyCall.Arguments[2];
        set.Names.Should().BeEquivalentTo("DatabaseName", "IsCollectionNameEditable", "CollectionNamePattern", "AnalyticsConfiguration", "LastUpdatedDate", "LastUpdatedBy");
        set.Contains("DbConnectionString").Should().BeFalse();
        ((BsonDocument)copyCall.Arguments[1])["_id"].AsString.Should().Be(CopyId);
        (await CopyColl.CountDocumentsAsync(new BsonDocument())).Should().Be(0, "no upsert: a missing tenant copy is never created");
    }

    [Fact]
    public async Task Update_TenantCopyWriteThrows_ErrorNoRedis_ResaveWorks()
    {
        AsAdmin();
        var s = _secrets.Add(Tenant, Custom);
        await SeedCopyAsync(Custom);
        await SeedRootAsync(s.Id);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .ThrowsAsync(new MongoException("copy write failed"));

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom));
        await act.Should().ThrowAsync<MongoException>();
        _cache.Verify(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()), Times.Never);

        _repo.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, BsonDocument d, string db) => _realRepo.UpdateAsync(c, f, d, db));
        var again = await Service().UpdateConfiguration(UpdateReq(Custom));

        again.IsSuccess.Should().BeTrue();
        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set");
        CapturedHashes().Should().ContainSingle();
    }

    [Fact]
    public async Task Update_RedisTodaysOrder_UnderBodyProjectKey_NoValue_VersionChangesEverySave()
    {
        AsAdmin();
        await SeedRootAsync("default");

        await Service().UpdateConfiguration(UpdateReq("default", projectKey: ProjectKey));
        await Task.Delay(5);
        await Service().UpdateConfiguration(UpdateReq("default", projectKey: ProjectKey));

        _sequence.Where(x => x.StartsWith("redis-", StringComparison.Ordinal)).Take(3)
            .Should().Equal("redis-exists", "redis-remove", "redis-addhash");
        _cache.Verify(c => c.AddHashValueAsync(ProjectKey, It.IsAny<IEnumerable<HashEntry>>()), Times.Exactly(2));
        var hashes = CapturedHashes();
        hashes.Should().AllSatisfy(h => h.Should().NotContain(e => e.Name == "DbConnectionString"));
        var v1 = hashes[0].Single(e => e.Name == "Version").Value.ToString();
        var v2 = hashes[1].Single(e => e.Name == "Version").Value.ToString();
        v1.Should().NotBe(v2);
    }

    [Fact]
    public void Validator_RefusesEmptyProjectKey_AndEmptyConnectionString()
    {
        var result = new UpdateDataSourceRequestValidator().Validate(new UpdateDataGatewayConfigurationRequest { ItemId = "i", ConnectionString = "", DatabaseName = "d", ProjectKey = "" });
        result.Errors.Select(e => e.ErrorMessage).Should().Contain(["ProjectKey_Is_Required.", "ConnectionString_Is_Required."]);
    }

    // ---------------- ANALYTICS ----------------

    [Fact]
    public async Task CanAccessAnalytics_RootTenantWithSeveralRootDocs_ReadsItsOwn()
    {
        AsAdmin("root-tenant");
        var open = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-1), ValidTill = DateTime.UtcNow.AddDays(1) };
        var closed = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-3), ValidTill = DateTime.UtcNow.AddDays(-1) };
        await SeedRootAsync("default", tenant: "other-1", configItemId: "o1", analytics: open);
        await SeedRootAsync("default", tenant: "other-2", configItemId: "o2", analytics: open);
        await SeedRootAsync("default", tenant: "root-tenant", configItemId: "r1", analytics: closed);

        (await Service().CanAccessAnalyticsAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task CanAccessAnalytics_NoRootDoc_FallsBackToTheTenantCopy()
    {
        AsAdmin();
        await CopyColl.InsertOneAsync(new BsonDocument
        {
            { "_id", CopyId }, { "IsDeleted", false },
            { "AnalyticsConfiguration", new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-1), ValidTill = DateTime.UtcNow.AddDays(1) }.ToBsonDocument() }
        });

        (await Service().CanAccessAnalyticsAsync()).Should().BeTrue();
    }
}
