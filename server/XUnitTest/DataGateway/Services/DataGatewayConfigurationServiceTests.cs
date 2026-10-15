using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// DataGatewayConfigurationService + DataSourceConfigStore on a real throwaway Mongo (root DB only), a real
/// DbRepository behind a forwarding mock (for fault injection), a real DataSourceSecretResolver and an in-memory secret
/// service. One model: root doc (<c>_id = TenantId</c>) + one <c>data-source</c> secret (plain value, <c>default</c> =
/// Blocks DB). Save = captcha style (Set first, Rotate later on the same id, new secret when the linked one is broken).
/// </summary>
[Collection("Mongo")]
public class DataGatewayConfigurationServiceTests
{
    private const string Tenant = "tenant-a";
    private const string ProjectKey = "tenant-a";
    private const string Custom = "mongodb://user:S3cr3tPass@byo-host:27017/?authSource=admin";
    private const string Custom2 = "mongodb://user:OtherPass@byo-host2:27017/";

    private readonly IMongoDatabase _rootDb;
    private readonly DbRepository _realRepo;
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<ICacheClient> _cache = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<IProjectService> _project = new();
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();
    private readonly System.Collections.Concurrent.ConcurrentQueue<string> _sequence = new();

    public DataGatewayConfigurationServiceTests(MongoFixture fixture)
    {
        _rootDb = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(fixture.CreateDatabase());
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
                _sequence.Enqueue("root-update");
                return _realRepo.FindOneAndUpdateAsync(c, f, u, up, db);
            });

        _cache.Setup(c => c.KeyExistsAsync(It.IsAny<string>())).Callback(() => _sequence.Enqueue("redis-exists")).ReturnsAsync(true);
        _cache.Setup(c => c.RemoveKeyAsync(It.IsAny<string>())).Callback(() => _sequence.Enqueue("redis-remove")).ReturnsAsync(true);
        _cache.Setup(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()))
            .Callback(() => _sequence.Enqueue("redis-addhash")).ReturnsAsync(true);

        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataGatewayConfigurationRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataGatewayConfigurationRequest>())).ReturnsAsync(new ValidationResult());
        _project.Setup(p => p.GetTenantSlugAsync(It.IsAny<string>())).ReturnsAsync("slug");

        _secrets.BeforeCall = (op, _) =>
        {
            _sequence.Enqueue("secret-" + op);
            return Task.CompletedTask;
        };
    }

    private DataSourceConfigStore Store() =>
        new(_repo.Object, _cache.Object, _secrets.Resolver(), _logs.CreateLogger<DataSourceConfigStore>());

    private DataGatewayConfigurationService Service() =>
        new(_repo.Object, _validator.Object, _project.Object, _secrets.Resolver(), Store(),
            _logs.CreateLogger<DataGatewayConfigurationService>());

    private static void AsAdmin(string tenant = Tenant) => BlocksTestContext.Set(userId: "admin-1", tenantId: tenant);

    private IMongoCollection<BsonDocument> RootColl => _rootDb.GetCollection<BsonDocument>("DataServiceConfigurations");

    private Task<BsonDocument> RootAsync(string tenant = Tenant) => RootColl.Find(new BsonDocument("_id", tenant)).FirstAsync();

    private IEnumerable<FakeSecretService.Stored> Own(string tenant = Tenant) => _secrets.Secrets.Values.Where(s => s.TenantId == tenant);

    private async Task SeedRootAsync(string secretId, string tenant = Tenant, bool deleted = false, AnalyticsConfiguration? analytics = null)
    {
        var doc = new BsonDocument
        {
            { "_id", tenant }, { "TenantId", tenant }, { "DatabaseName", "byo-db" }, { "IsDeleted", deleted },
            { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" },
            { "LastUpdatedDate", DateTime.UtcNow.AddHours(-1) },
            { "DbConnectionSecretId", secretId }
        };
        if (analytics is not null) doc["AnalyticsConfiguration"] = analytics.ToBsonDocument();
        await RootColl.InsertOneAsync(doc);
    }

    /// <summary>Root doc + a secret with <paramref name="value"/> in the given state.</summary>
    private async Task<string> SeedAsync(string value, string status = SecretStatuses.Active, string tenant = Tenant)
    {
        var secret = _secrets.Add(tenant, value, status);
        await SeedRootAsync(secret.Id, tenant);
        return secret.Id;
    }

    private static UpdateDataGatewayConfigurationRequest UpdateReq(string? value, string itemId = Tenant, string projectKey = ProjectKey) => new()
    {
        ItemId = itemId, ConnectionString = value, DatabaseName = "byo-db-2", ProjectKey = projectKey,
        IsCollectionNameEditable = true, CollectionNamePattern = "x_{SchemaName}"
    };

    private List<HashEntry[]> CapturedHashes() =>
        _cache.Invocations.Where(i => i.Method.Name == nameof(ICacheClient.AddHashValueAsync))
            .Select(i => ((IEnumerable<HashEntry>)i.Arguments[1]).ToArray()).ToList();

    // ---------------- GET ----------------

    [Fact]
    public async Task Get_NoRootDoc_CreatesTheDefaultRootDocAndSecret_AnswersDefault()
    {
        AsAdmin();

        var result = await Service().GetConfiguration(ProjectKey);

        result.IsSuccess.Should().BeTrue();
        result.Data!.ConnectionType.Should().Be("Default");
        result.Data.ItemId.Should().Be(Tenant);
        var root = await RootAsync();
        root["TenantId"].AsString.Should().Be(Tenant);
        root["DatabaseName"].AsString.Should().Be("default");
        root["IsCollectionNameEditable"].AsBoolean.Should().BeFalse();
        root["CollectionNamePattern"].AsString.Should().Be("sb_{SchemaName}s");
        root["ProjectKey"].AsString.Should().BeEmpty();
        root["ProjectShortKey"].AsString.Should().BeEmpty();
        (root.GetValue("AnalyticsConfiguration", BsonNull.Value).IsBsonNull).Should().BeTrue();
        root["IsDeleted"].AsBoolean.Should().BeFalse();
        var secret = Own().Single();
        secret.Type.Should().Be(SecretTypes.Service);
        secret.Name.Should().Be("data-source");
        secret.Value.Should().Be("default");
        root["DbConnectionSecretId"].AsString.Should().Be(secret.Id);
        foreach (var legacy in new[] { "DbConnectionString", "ConfigItemId", "ValueChangedAfterDeploy" })
            root.Contains(legacy).Should().BeFalse(legacy);
    }

    [Fact]
    public async Task Get_RootCustom_AnswersCustom_NeverTheValue()
    {
        AsAdmin();
        await SeedAsync(Custom);

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.ConnectionType.Should().Be("Custom");
        result.Data.DatabaseName.Should().Be("byo-db");
        System.Text.Json.JsonSerializer.Serialize(result).Should().NotContain("S3cr3tPass").And.NotContain("mongodb://");
        typeof(DataGatewayConfigurationResponse).GetProperties().Select(p => p.Name).Should().NotContain("DbConnectionString");
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("S3cr3tPass"));
    }

    [Fact]
    public async Task Get_RootDefault_AnswersDefault()
    {
        AsAdmin();
        await SeedAsync("default");

        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Default");
    }

    [Theory]
    [InlineData("Locked", "locked")]
    [InlineData("Deleted", "archived")]
    public async Task Get_LockedOrArchivedSecret_Answers200Custom_AndWarns_NoCreate(string status, string state)
    {
        AsAdmin();
        await SeedAsync("default", status == "Locked" ? SecretStatuses.Locked : SecretStatuses.Deleted);

        var result = await Service().GetConfiguration(ProjectKey);

        result.IsSuccess.Should().BeTrue();
        result.Data!.ConnectionType.Should().Be("Custom", "such a tenant fails closed at runtime, it must not look like a Blocks DB tenant");
        _logs.Logs.Should().Contain(l => l.Message.Contains("get-secret-unusable") && l.Message.Contains(state));
        Own().Should().ContainSingle();
    }

    [Fact]
    public async Task Get_MissingSecret_AndActiveWithVaultValueGone_Answer200Custom()
    {
        AsAdmin();
        var id = await SeedAsync("x");
        _secrets.Secrets[id].Value = null;
        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Custom");

        _secrets.Secrets.Clear();
        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Custom");
    }

    [Fact]
    public async Task Get_VaultDown_ThrowsWithTheInnerExceptionsOwnMessage()
    {
        AsAdmin();
        await SeedAsync("default");
        _secrets.FailWith = new InvalidOperationException("vault down");

        var act = () => Service().GetConfiguration(ProjectKey);

        (await act.Should().ThrowAsync<DataSourceUnavailableException>()).WithMessage("vault down");
    }

    [Fact]
    public async Task Get_SoftDeletedRootDoc_FailsClosed_NothingCreated()
    {
        AsAdmin();
        await SeedRootAsync("some-secret", deleted: true);

        var act = () => Service().GetConfiguration(ProjectKey);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(1);
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Get_OtherTenantsRootDoc_IsNeverRead()
    {
        AsAdmin();
        await SeedAsync(Custom, tenant: "tenant-b");

        var result = await Service().GetConfiguration(ProjectKey);

        result.Data!.ConnectionType.Should().Be("Default");
        (await RootAsync("tenant-b"))["DbConnectionSecretId"].AsString.Should().NotBeEmpty();
        Own(Tenant).Should().ContainSingle(s => s.Value == "default");
    }

    // ---------------- first use (create the default root doc) ----------------

    [Fact]
    public async Task FirstUse_TwoParallelRequests_OneRootDoc_LoserDeletesItsOwnSecret()
    {
        AsAdmin();
        var sets = 0;
        var bothSet = new TaskCompletionSource();
        _secrets.BeforeCall = async (op, _) =>
        {
            if (op != "Set") return;
            if (Interlocked.Increment(ref sets) == 2) bothSet.SetResult();
            await bothSet.Task.WaitAsync(TimeSpan.FromSeconds(20));
        };

        var results = await Task.WhenAll(Task.Run(() => { AsAdmin(); return Service().GetConfiguration(ProjectKey); }),
            Task.Run(() => { AsAdmin(); return Service().GetConfiguration(ProjectKey); }));

        results.Should().OnlyContain(r => r.IsSuccess);
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(1);
        var winnerId = (await RootAsync())["DbConnectionSecretId"].AsString;
        Own().Should().HaveCount(2);
        Own().Single(s => s.Id == winnerId).Status.Should().Be(SecretStatuses.Active);
        Own().Single(s => s.Id != winnerId).Status.Should().Be(SecretStatuses.Deleted);
    }

    [Fact]
    public async Task FirstUse_InsertFails_OwnSecretDeleted_ErrorKept()
    {
        AsAdmin();
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataServiceConfiguration>(), It.IsAny<string>())).ThrowsAsync(new InvalidOperationException("mongo down"));

        var act = () => Service().GetConfiguration(ProjectKey);

        (await act.Should().ThrowAsync<InvalidOperationException>()).WithMessage("mongo down");
        Own().Should().ContainSingle().Which.Status.Should().Be(SecretStatuses.Deleted);
    }

    [Fact]
    public async Task FirstUse_VaultDown_NoDocCreated()
    {
        AsAdmin();
        _secrets.FailWith = new InvalidOperationException("vault down");

        var act = () => Service().GetConfiguration(ProjectKey);

        await act.Should().ThrowAsync<InvalidOperationException>();
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    // ---------------- SAVE (captcha style) ----------------

    [Fact]
    public async Task Save_FirstSaveOnNewTenant_SeedSecretIsSet_ThenRotatedWithThePlainValue_SameId()
    {
        AsAdmin();

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().Be(Tenant);
        var secret = Own().Single();
        secret.Value.Should().Be(Custom, "plain text, not base64");
        secret.Type.Should().Be(SecretTypes.Service);
        secret.Name.Should().Be("data-source");
        _secrets.Calls.Select(c => c.Op).Should().Equal("Set", "Get", "Rotate");
        var root = await RootAsync();
        root["DbConnectionSecretId"].AsString.Should().Be(secret.Id);
        root["DatabaseName"].AsString.Should().Be("byo-db-2");
        root["IsCollectionNameEditable"].AsBoolean.Should().BeTrue();
        root["CollectionNamePattern"].AsString.Should().Be("x_{SchemaName}");
        root["LastUpdatedBy"].AsString.Should().Be("admin-1");
        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Custom");
    }

    [Fact]
    public async Task Save_LaterSave_RotatesTheSameSecret_NoSetNoDelete_AndOrderIsSecretThenDocThenRedis()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        var result = await Service().UpdateConfiguration(UpdateReq(Custom2));

        result.IsSuccess.Should().BeTrue();
        _secrets.Secrets[id].Value.Should().Be(Custom2);
        Own().Should().ContainSingle();
        _secrets.Calls.Select(c => c.Op).Should().NotContain(["Set", "Delete"]);
        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be(id);
        var order = _sequence.Where(x => x is "secret-Rotate" or "root-update" or "redis-addhash").ToList();
        order.Should().Equal("secret-Rotate", "root-update", "redis-addhash");
    }

    [Theory]
    [InlineData("Deleted")]
    [InlineData("Missing")]
    [InlineData("EmptyId")]
    public async Task Save_BrokenLinkedSecret_CreatesANewSecret_RepointsTheDoc_LeavesTheOldOne(string broken)
    {
        AsAdmin();
        string oldId;
        if (broken == "EmptyId") { await SeedRootAsync(string.Empty); oldId = string.Empty; }
        else if (broken == "Deleted") oldId = await SeedAsync("default", SecretStatuses.Deleted);
        else { oldId = "no-such-secret"; await SeedRootAsync(oldId); }

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.IsSuccess.Should().BeTrue();
        var newId = (await RootAsync())["DbConnectionSecretId"].AsString;
        newId.Should().NotBe(oldId).And.NotBeEmpty();
        _secrets.Secrets[newId].Value.Should().Be(Custom);
        _secrets.Secrets[newId].Status.Should().Be(SecretStatuses.Active);
        _secrets.Calls.Select(c => c.Op).Should().NotContain(["Rotate", "Delete"]);
        if (broken == "Deleted") _secrets.Secrets[oldId].Status.Should().Be(SecretStatuses.Deleted);
        CapturedHashes().Single().Single(e => e.Name == "DbConnectionSecretId").Value.ToString().Should().Be(newId);
    }

    [Fact]
    public async Task Save_LockedSecret_IsRotated_NotRepaired()
    {
        AsAdmin();
        var id = await SeedAsync("default", SecretStatuses.Locked);

        await Service().UpdateConfiguration(UpdateReq(Custom));

        _secrets.Calls.Select(c => c.Op).Should().Contain("Rotate").And.NotContain("Set");
        _secrets.Secrets[id].Value.Should().Be(Custom);
    }

    [Fact]
    public async Task Save_MetadataReadFails_IsNotBroken_RotateIsTried()
    {
        AsAdmin();
        var id = await SeedAsync("default");
        _secrets.BeforeCall = (op, _) => op == "Get" ? throw new InvalidOperationException("meta down") : Task.CompletedTask;

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.IsSuccess.Should().BeTrue();
        _secrets.Secrets[id].Value.Should().Be(Custom);
        _secrets.Calls.Select(c => c.Op).Should().NotContain("Set");
    }

    [Fact]
    public async Task Save_SwitchCustomToDefaultAndBack_SameSecret_ValueFollows_HashTypeFollows()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        await Service().UpdateConfiguration(UpdateReq("default"));
        _secrets.Secrets[id].Value.Should().Be("default");
        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Default");

        await Service().UpdateConfiguration(UpdateReq(Custom2));
        _secrets.Secrets[id].Value.Should().Be(Custom2);
        (await Service().GetConfiguration(ProjectKey)).Data!.ConnectionType.Should().Be("Custom");

        Own().Should().ContainSingle();
        CapturedHashes().Select(h => h.Single(e => e.Name == "ConnectionType").Value.ToString()).Should().Equal("Default", "Custom");
    }

    [Theory]
    [InlineData("")]
    [InlineData("default")]
    [InlineData("DEFAULT")]
    [InlineData("  ")]
    public async Task Save_DefaultInAnyForm_StoresTheTextDefault(string value)
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        await Service().UpdateConfiguration(UpdateReq(value));

        _secrets.Secrets[id].Value.Should().Be("default");
    }

    [Fact]
    public async Task Save_ConnectionStringOmitted_KeepsTheSecret_NoSecretWrite_UpdatesFields_HashTypeFromSecret()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        var result = await Service().UpdateConfiguration(UpdateReq(null));

        result.IsSuccess.Should().BeTrue();
        _secrets.Secrets[id].Value.Should().Be(Custom);
        _secrets.Calls.Select(c => c.Op).Should().NotContain(["Set", "Rotate", "Delete"]);
        (await RootAsync())["CollectionNamePattern"].AsString.Should().Be("x_{SchemaName}");
        CapturedHashes().Single().Single(e => e.Name == "ConnectionType").Value.ToString().Should().Be("Custom");
    }

    [Fact]
    public async Task Save_ItemIdNotTheTenant_404_NothingWritten()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        var result = await Service().UpdateConfiguration(UpdateReq(Custom2, itemId: "someone-else"));

        result.HttpStatusCode.Should().Be(404);
        _secrets.Secrets[id].Value.Should().Be(Custom);
        _secrets.Calls.Select(c => c.Op).Should().NotContain(["Set", "Rotate"]);
        CapturedHashes().Should().BeEmpty();
    }

    [Fact]
    public async Task Save_SoftDeletedRootDoc_FailsClosed()
    {
        AsAdmin();
        await SeedRootAsync("x", deleted: true);

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom));

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Save_RepairThenDocWriteThrows_TheNewSecretIsDeleted_ErrorKept_NoRedis()
    {
        AsAdmin();
        await SeedRootAsync("no-such-secret");
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("mongo down"));

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom));

        (await act.Should().ThrowAsync<InvalidOperationException>()).WithMessage("mongo down");
        Own().Should().ContainSingle().Which.Status.Should().Be(SecretStatuses.Deleted);
        (await RootAsync())["DbConnectionSecretId"].AsString.Should().Be("no-such-secret");
        CapturedHashes().Should().BeEmpty();
    }

    [Fact]
    public async Task Save_RotateThenDocWriteThrows_NoDelete_ResaveWorks()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);
        var fail = true;
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, UpdateDefinition<BsonDocument> u, bool up, string db) =>
                fail ? throw new InvalidOperationException("mongo down") : _realRepo.FindOneAndUpdateAsync(c, f, u, up, db));

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom2));
        await act.Should().ThrowAsync<InvalidOperationException>();
        _secrets.Calls.Select(c => c.Op).Should().NotContain("Delete");

        fail = false;
        (await Service().UpdateConfiguration(UpdateReq(Custom2))).IsSuccess.Should().BeTrue();
        CapturedHashes().Should().ContainSingle();
        _secrets.Secrets[id].Value.Should().Be(Custom2);
    }

    [Fact]
    public async Task Save_DocGoneBeforeTheWrite_404_AndTheRepairSecretIsDeleted()
    {
        AsAdmin();
        await SeedRootAsync("no-such-secret");
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .ReturnsAsync((BsonDocument?)null);

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.HttpStatusCode.Should().Be(404);
        Own().Should().ContainSingle().Which.Status.Should().Be(SecretStatuses.Deleted);
        CapturedHashes().Should().BeEmpty();
    }

    [Fact]
    public async Task Save_VaultDownOnRotate_Throws_DocAndRedisUntouched()
    {
        AsAdmin();
        await SeedAsync(Custom);
        _secrets.BeforeCall = (op, _) => op == "Rotate" ? throw new InvalidOperationException("vault down") : Task.CompletedTask;

        var act = () => Service().UpdateConfiguration(UpdateReq(Custom2));

        await act.Should().ThrowAsync<InvalidOperationException>();
        (await RootAsync())["DatabaseName"].AsString.Should().Be("byo-db");
        CapturedHashes().Should().BeEmpty();
    }

    [Fact]
    public async Task Save_BlankPattern_KeepsTheStoredOne_BlankDatabaseName_KeepsTheStoredOne()
    {
        AsAdmin();
        await SeedAsync("default");
        var req = UpdateReq("default");
        req.CollectionNamePattern = string.Empty;
        req.DatabaseName = string.Empty;

        await Service().UpdateConfiguration(req);

        var root = await RootAsync();
        root["CollectionNamePattern"].AsString.Should().Be("sb_{SchemaName}s");
        root["DatabaseName"].AsString.Should().Be("byo-db");
    }

    [Fact]
    public async Task Save_Analytics_FirstEnableStartsA14DayWindow_FieldsKept()
    {
        AsAdmin();
        await SeedAsync("default");
        var req = UpdateReq("default");
        req.EnableAnalytics = true;

        await Service().UpdateConfiguration(req);

        var analytics = (await RootAsync())["AnalyticsConfiguration"].AsBsonDocument;
        analytics["EnableAnalytics"].AsBoolean.Should().BeTrue();
        (analytics["ValidTill"].ToUniversalTime() - analytics["EnableDate"].ToUniversalTime()).TotalDays.Should().BeApproximately(14, 0.01);
        (await RootAsync()).Contains("DbConnectionString").Should().BeFalse();
    }

    [Fact]
    public async Task Save_RedisHash_ExactShape_UnderBodyProjectKey_NoValue_VersionIsTheDocsLastUpdate()
    {
        AsAdmin();
        await SeedAsync(Custom);

        await Service().UpdateConfiguration(UpdateReq(Custom2, projectKey: "tenant-a"));

        _sequence.Where(x => x.StartsWith("redis-", StringComparison.Ordinal)).Should().Equal("redis-exists", "redis-remove", "redis-addhash");
        _cache.Verify(c => c.AddHashValueAsync("tenant-a", It.IsAny<IEnumerable<HashEntry>>()), Times.Once);
        var hash = CapturedHashes().Single();
        hash.Select(e => e.Name.ToString()).Should().Equal("DbConnectionSecretId", "DatabaseName", "ConnectionType", "Version");
        var root = await RootAsync();
        hash.Single(e => e.Name == "DbConnectionSecretId").Value.ToString().Should().Be(root["DbConnectionSecretId"].AsString);
        hash.Single(e => e.Name == "DatabaseName").Value.ToString().Should().Be("byo-db-2");
        hash.Single(e => e.Name == "ConnectionType").Value.ToString().Should().Be("Custom");
        hash.Single(e => e.Name == "Version").Value.ToString()
            .Should().Be(DataSourceConfigStore.VersionOf(root["LastUpdatedDate"].ToUniversalTime()).ToString());
        hash.Select(e => e.Value.ToString()).Should().NotContain(v => v.Contains("S3cr3t") || v.Contains("OtherPass") || v.Contains("mongodb://"));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("OtherPass") || l.AllText().Contains("S3cr3tPass"));
    }

    [Fact]
    public async Task Save_VersionChangesEverySave()
    {
        AsAdmin();
        await SeedAsync("default");

        await Service().UpdateConfiguration(UpdateReq("default"));
        await Task.Delay(5);
        await Service().UpdateConfiguration(UpdateReq("default"));

        var hashes = CapturedHashes();
        hashes[0].Single(e => e.Name == "Version").Value.ToString().Should().NotBe(hashes[1].Single(e => e.Name == "Version").Value.ToString());
    }

    [Fact]
    public async Task Post_IgnoresItemId_WorksOnAnExistingDoc_AndOnANewTenant()
    {
        AsAdmin();
        var created = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        {
            ItemId = "ignored", ConnectionString = Custom, DatabaseName = "byo", ProjectKey = ProjectKey
        });
        created.IsSuccess.Should().BeTrue();
        created.Data!.ItemId.Should().Be(Tenant);
        Own().Should().ContainSingle().Which.Value.Should().Be(Custom);

        var again = await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest
        {
            ConnectionString = null, DatabaseName = "byo", ProjectKey = ProjectKey
        });
        again.IsSuccess.Should().BeTrue();
        Own().Should().ContainSingle().Which.Value.Should().Be("default", "a POST without a value means the Blocks DB");
    }

    [Fact]
    public async Task Post_DoesNotTouchCollectionOptions()
    {
        AsAdmin();
        await SeedAsync("default");
        await RootColl.UpdateOneAsync(new BsonDocument("_id", Tenant), new BsonDocument("$set", new BsonDocument("IsCollectionNameEditable", true)));

        await Service().InsertConfiguration(new CreateDataGatewayConfigurationRequest { ConnectionString = "default", DatabaseName = "d", ProjectKey = ProjectKey });

        (await RootAsync())["IsCollectionNameEditable"].AsBoolean.Should().BeTrue();
    }

    [Fact]
    public async Task Save_InvalidRequest_ReturnsErrors_NothingWritten()
    {
        AsAdmin();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataGatewayConfigurationRequest>()))
            .ReturnsAsync(new ValidationResult([new ValidationFailure("ProjectKey", "ProjectKey_Is_Required.")]));

        var result = await Service().UpdateConfiguration(UpdateReq(Custom));

        result.IsSuccess.Should().BeFalse();
        _secrets.Calls.Should().BeEmpty();
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    // ---------------- validators ----------------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("default")]
    [InlineData(Custom)]
    public void Validator_AcceptsNullEmptyDefaultAndARealString(string? value)
    {
        new UpdateDataSourceRequestValidator().Validate(new UpdateDataGatewayConfigurationRequest { ItemId = Tenant, ConnectionString = value, DatabaseName = "d", ProjectKey = "p" })
            .IsValid.Should().BeTrue();
        new CreateDataSourceRequestValidator().Validate(new CreateDataGatewayConfigurationRequest { ConnectionString = value, DatabaseName = "d", ProjectKey = "p" })
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_RefusesGarbage_WithoutEchoingIt_AndEmptyProjectKey_DatabaseNameOnlyForCustom()
    {
        var bad = new UpdateDataSourceRequestValidator().Validate(new UpdateDataGatewayConfigurationRequest
        { ItemId = "i", ConnectionString = "p@ssw0rd pasted by mistake", DatabaseName = "", ProjectKey = "" });
        bad.Errors.Select(e => e.ErrorMessage).Should().Contain(["ProjectKey_Is_Required.", "ConnectionString_Is_Invalid."]);
        bad.Errors.Select(e => e.ErrorMessage).Should().OnlyContain(m => !m.Contains("p@ssw0rd"));

        var customNoDb = new UpdateDataSourceRequestValidator().Validate(new UpdateDataGatewayConfigurationRequest
        { ItemId = "i", ConnectionString = Custom, DatabaseName = "", ProjectKey = "p" });
        customNoDb.Errors.Select(e => e.ErrorMessage).Should().Contain("DatabaseName_Is_Required.");

        var defaultNoDb = new UpdateDataSourceRequestValidator().Validate(new UpdateDataGatewayConfigurationRequest
        { ItemId = "i", ConnectionString = "default", DatabaseName = "", ProjectKey = "p" });
        defaultNoDb.IsValid.Should().BeTrue();
    }

    // ---------------- runtime resolve source (store.LoadAsync) ----------------

    [Fact]
    public async Task Load_NoRootDoc_CreatesIt_AnswersDefault_WritesTheHash()
    {
        AsAdmin();

        var route = await Store().LoadAsync(Tenant);

        route.IsCustom.Should().BeFalse();
        route.DatabaseName.Should().Be("default");
        Own().Should().ContainSingle().Which.Value.Should().Be("default");
        var hash = CapturedHashes().Single();
        hash.Single(e => e.Name == "ConnectionType").Value.ToString().Should().Be("Default");
        hash.Single(e => e.Name == "Version").Value.ToString().Should().Be(route.Version);
        _cache.Verify(c => c.AddHashValueAsync(Tenant, It.IsAny<IEnumerable<HashEntry>>()), Times.Once);
    }

    [Fact]
    public async Task Load_Custom_AnswersCustom_WithSecretIdAndDbName_NoValueInRouteOrHash()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        var route = await Store().LoadAsync(Tenant);

        route.IsCustom.Should().BeTrue();
        route.SecretId.Should().Be(id);
        route.DatabaseName.Should().Be("byo-db");
        route.ToString().Should().NotContain("S3cr3tPass");
        CapturedHashes().Single().Select(e => e.Value.ToString()).Should().NotContain(v => v.Contains("S3cr3tPass"));
    }

    [Theory]
    [InlineData("Deleted")]
    [InlineData("Locked")]
    [InlineData("Missing")]
    [InlineData("NoValue")]
    public async Task Load_BrokenSecret_FailsClosed_NoHashWritten(string state)
    {
        AsAdmin();
        if (state == "Missing") await SeedRootAsync("no-such-secret");
        else
        {
            var id = await SeedAsync("default", state == "Deleted" ? SecretStatuses.Deleted : state == "Locked" ? SecretStatuses.Locked : SecretStatuses.Active);
            if (state == "NoValue") _secrets.Secrets[id].Value = null;
        }

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
        CapturedHashes().Should().BeEmpty();
        Own().Count().Should().BeLessThanOrEqualTo(1, "a broken secret is never silently replaced at runtime");
    }

    [Fact]
    public async Task Load_RootDocWithoutSecretId_FailsClosed()
    {
        AsAdmin();
        await SeedRootAsync(string.Empty);

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
    }

    // ---------------- ANALYTICS ----------------

    [Fact]
    public async Task CanAccessAnalytics_ReadsTheCallersOwnRootDoc_NotAnotherTenants_NeverCreates()
    {
        AsAdmin("root-tenant");
        var open = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-1), ValidTill = DateTime.UtcNow.AddDays(1) };
        var closed = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-3), ValidTill = DateTime.UtcNow.AddDays(-1) };
        await SeedRootAsync("s1", tenant: "other-1", analytics: open);
        await SeedRootAsync("s2", tenant: "root-tenant", analytics: closed);

        (await Service().CanAccessAnalyticsAsync()).Should().BeFalse();
        AsAdmin("other-1");
        (await Service().CanAccessAnalyticsAsync()).Should().BeTrue();

        AsAdmin("no-doc-tenant");
        (await Service().CanAccessAnalyticsAsync()).Should().BeFalse();
        (await RootColl.CountDocumentsAsync(new BsonDocument("_id", "no-doc-tenant"))).Should().Be(0);
        _secrets.Calls.Should().BeEmpty();
    }

}
