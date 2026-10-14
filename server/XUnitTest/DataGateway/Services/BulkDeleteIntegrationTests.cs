using Blocks.Genesis.DataAccess.Evaluation;
using System.Collections.Immutable;
using System.Text;
using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Bulk delete (data SPEC1 §3.3b) end to end on a real throwaway Mongo: real GqlDbRepository (behind a recording
/// decorator for hooks), real MutationService, real DataChangeEventPublisher with a capturing message client.
/// H2, H11–H14, C34–C41, C50, R-BULK-*, R-ID-*, R-FAIL-BATCH2.
/// </summary>
[Collection("Mongo")]
public class BulkDeleteIntegrationTests
{
    private const string Tenant = "bulk-tenant";
    private readonly MongoFixture _fixture;
    private readonly IMongoDatabase _db;
    private readonly InputObjectType _deleteInput;
    private readonly Mock<ICacheClient> _cache = new();
    private readonly CapturingMessageClient _messages = new();
    private readonly RecordingGqlRepository _repo;

    public BulkDeleteIntegrationTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        _cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        _repo = new RecordingGqlRepository(new GqlDbRepository(provider.Object, _cache.Object, Mock.Of<IDataSourceClientCache>()));

        var schemaRepo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        schemaRepo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = Guid.NewGuid().ToString(), SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity,
                Fields = new() { new FieldDefinition { Name = "Name", Type = "String" }, new FieldDefinition { Name = "Tag", Type = "String" } }
            }
        }).GetAwaiter().GetResult();
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        var builder = new GraphqlSchemaBuilder(resolver, schemaRepo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        _deleteInput = schemaBuilder.Create().GetType<InputObjectType>("PersonDeleteInput");
    }

    private void Ambient()
    {
        BlocksTestContext.Set(userId: "deleter-1", tenantId: Tenant);
        RequestContextAccessor.Current = new RequestContext { TenantId = Tenant };
    }

    private MutationService Service() =>
        new(_repo, new DataChangeEventPublisher(_messages, NullLogger<DataChangeEventPublisher>.Instance), TestSupport.Resolver(), TestSupport.Principals(), NullLogger<MutationService>.Instance);

    private IMongoCollection<BsonDocument> Coll(string name = "Persons") => _db.GetCollection<BsonDocument>(name);

    private static IResolverContext Ctx(string filterJson, bool hardDelete, CancellationToken requestAborted = default)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {{ isHardDelete: {(hardDelete ? "true" : "false")} }}) {{ y }} }}");
        var literal = ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("bulkDelete");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(literal);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns((object?)null);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns(filterJson);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        ctx.Setup(c => c.RequestAborted).Returns(requestAborted);
        return ctx.Object;
    }

    private static SchemaDefinitionExtended PersonSchema(SchemaAccessLevel delete = SchemaAccessLevel.Public, List<DataAccessPolicy>? policies = null) =>
        Schema(delete: delete, fields: new() { Field("Name"), Field("Tag") }, policies: policies);

    private async Task SeedAsync(int count, string tag = "bd", Func<int, BsonValue>? id = null, int padBytes = 0, string? createdBy = null)
    {
        var pad = padBytes > 0 ? new string('x', padBytes) : null;
        for (var start = 0; start < count; start += 200)
        {
            var docs = Enumerable.Range(start, Math.Min(200, count - start)).Select(i =>
            {
                var d = new BsonDocument { { "_id", id?.Invoke(i) ?? Guid.NewGuid().ToString() }, { "Name", "n" + i }, { "Tag", tag } };
                if (pad is not null) d["Pad"] = pad;
                if (createdBy is not null) d["CreatedBy"] = i % 2 == 0 ? createdBy : "someone-else";
                return d;
            }).ToList();
            await Coll().InsertManyAsync(docs);
        }
    }

    private long AuditCount() => _db.GetCollection<BsonDocument>("ObjectAuditLogs").CountDocuments(new BsonDocument());

    [Theory]
    [InlineData(10, 1)]
    [InlineData(11, 1)]
    [InlineData(500, 1)]
    [InlineData(501, 2)]
    [InlineData(1001, 3)]
    public async Task SoftBulkDelete_DeletesAll_WithOneCopyAndOneEventEach(int count, int batches)
    {
        Ambient();
        await SeedAsync(count);
        await SeedAsync(7, tag: "keep");

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

        result.Acknowledged.Should().BeTrue();
        result.TotalImpactedData.Should().Be(count);
        (await Coll().CountDocumentsAsync(new BsonDocument("Tag", "bd"))).Should().Be(0);
        (await Coll().CountDocumentsAsync(new BsonDocument("Tag", "keep"))).Should().Be(7);
        AuditCount().Should().Be(count);
        var audit = await _db.GetCollection<BsonDocument>("ObjectAuditLogs").Find(new BsonDocument()).FirstAsync();
        audit["Action"].AsString.Should().Be("data-delete");
        audit["UserId"].AsString.Should().Be("deleter-1");
        audit["TenantId"].AsString.Should().Be(Tenant);
        audit["Record"]["Tag"].AsString.Should().Be("bd");
        _db.ListCollectionNames().ToList().Should().NotContain("DataMutationRecords");
        var ids = _messages.Messages.SelectMany(m => m.Ids).ToList();
        ids.Should().HaveCount(count).And.OnlyHaveUniqueItems();
        _repo.BatchReads.Count(b => b.Count > 0).Should().Be(batches);
        _messages.Messages.Should().AllSatisfy(m => m.WireBytes.Should().BeLessThanOrEqualTo(DataChangeEventPublisher.MessageCapBytes));
    }

    [Fact]
    public async Task HardBulkDelete_501_NoCopies_EventsForAll()
    {
        Ambient();
        await SeedAsync(501);

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", true), _deleteInput);

        result.TotalImpactedData.Should().Be(501);
        AuditCount().Should().Be(0);
        _messages.Messages.SelectMany(m => m.Ids).Should().HaveCount(501).And.OnlyHaveUniqueItems();
        _messages.Messages.Count.Should().BeGreaterThanOrEqualTo(2, "one message per batch at least (500 + 1)");
    }

    [Fact]
    public async Task NoMatch_TodaysNotFound()
    {
        Ambient();
        await SeedAsync(3, tag: "other");
        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"none\"}", false), _deleteInput);
        result.Acknowledged.Should().BeFalse();
        result.Message.Should().Contain("No data found");
        _messages.Messages.Should().BeEmpty();
    }

    [Fact]
    public async Task MixedIdTypes_903_AllDeleted_RawTypesInTheInFilter()
    {
        Ambient();
        var oids = Enumerable.Range(0, 300).Select(_ => ObjectId.GenerateNewId()).ToList();
        await SeedAsync(300, id: _ => Guid.NewGuid().ToString());
        await SeedAsync(300, id: i => oids[i]);
        await SeedAsync(300, id: i => new BsonInt32(i + 1));
        await SeedAsync(2, id: i => new BsonInt64(10_000_000_000L + i));
        await SeedAsync(1, id: _ => new BsonDocument { { "k", 1 }, { "s", "a" } });

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

        result.TotalImpactedData.Should().Be(903);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        AuditCount().Should().Be(903);
        _messages.Messages.SelectMany(m => m.Ids).Should().HaveCount(903).And.OnlyHaveUniqueItems();
        var inValues = _repo.DeleteFilters.SelectMany(f => f["$and"][1]["_id"]["$in"].AsBsonArray).ToList();
        inValues.Count(v => v.IsObjectId).Should().Be(300);
        inValues.Count(v => v.IsInt32).Should().Be(300);
        inValues.Count(v => v.IsInt64).Should().Be(2);
        inValues.Count(v => v.IsBsonDocument).Should().Be(1);
        inValues.Should().NotContain(v => v.IsString && oids.Select(o => o.ToString()).Contains(v.AsString));
    }

    [Fact]
    public async Task WhereHoldsId_AndKeepsTheUsersFilter_OnlyThose2Deleted()
    {
        Ambient();
        var o1 = ObjectId.GenerateNewId();
        var o2 = ObjectId.GenerateNewId();
        await Coll().InsertManyAsync(new[]
        {
            new BsonDocument { { "_id", o1 }, { "Tag", "bd" } }, new BsonDocument { { "_id", o2 }, { "Tag", "bd" } },
            new BsonDocument { { "_id", "s1" }, { "Tag", "bd" } }, new BsonDocument { { "_id", "s2" }, { "Tag", "bd" } },
            new BsonDocument { { "_id", "s3" }, { "Tag", "bd" } }
        });

        var result = await Service().BulkDeleteAsync(PersonSchema(),
            Ctx($"{{\"_id\": {{\"$in\": [ObjectId(\"{o1}\"), \"s1\"]}}}}", false), _deleteInput);

        result.TotalImpactedData.Should().Be(2);
        var left = (await Coll().Find(new BsonDocument()).ToListAsync()).Select(d => d["_id"]).ToList();
        left.Should().BeEquivalentTo(new BsonValue[] { o2, "s2", "s3" });
        _repo.DeleteFilters.Should().AllSatisfy(f => f.Names.Should().Equal("$and"));
    }

    [Fact]
    public async Task RlsFilter_InEveryReadAndDelete_HiddenRecordsStay()
    {
        Ambient();
        await SeedAsync(600, createdBy: "deleter-1");
        var policy = Policy(PolicyType.RLS, PolicyOperation.DELETE, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, staticValue: "deleter-1")));

        var result = await Service().BulkDeleteAsync(PersonSchema(SchemaAccessLevel.Custom, [policy]), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

        result.TotalImpactedData.Should().Be(300);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(300);
        (await Coll().CountDocumentsAsync(new BsonDocument("CreatedBy", "someone-else"))).Should().Be(300);
        AuditCount().Should().Be(300);
        _repo.BatchFilters.Should().AllSatisfy(f => f.ToJson().Should().Contain("deleter-1"));
        _repo.DeleteFilters.Should().AllSatisfy(f => f.ToJson().Should().Contain("deleter-1"));
    }

    [Fact]
    public async Task RecordChangedBetweenReadAndDelete_IsKept_ButInTheCopiesAndEvents()
    {
        Ambient();
        await SeedAsync(5);
        var first = true;
        _repo.AfterBatchRead = async batch =>
        {
            if (!first) return;
            first = false;
            await Coll().UpdateOneAsync(new BsonDocument("_id", batch.Documents[0]["_id"]), new BsonDocument("$set", new BsonDocument("Tag", "changed")));
        };

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

        result.TotalImpactedData.Should().Be(4);
        (await Coll().CountDocumentsAsync(new BsonDocument("Tag", "changed"))).Should().Be(1);
        AuditCount().Should().Be(5);
        _messages.Messages.SelectMany(m => m.Ids).Should().HaveCount(5);
    }

    [Fact]
    public async Task EveryReadDocChangedBeforeDelete_DeletedZero_LoopStops_NoHang()
    {
        Ambient();
        await SeedAsync(3);
        _repo.AfterBatchRead = async _ => await Coll().UpdateManyAsync(new BsonDocument(), new BsonDocument("$set", new BsonDocument("Tag", "changed")));

        var task = Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);
        var finished = await Task.WhenAny(task, Task.Delay(TimeSpan.FromSeconds(30)));

        finished.Should().Be(task);
        (await task).TotalImpactedData.Should().Be(0);
        _repo.BatchReads.Should().HaveCount(1);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(3);
    }

    [Fact]
    public async Task InsertDuringTheLoop_IsDeletedToo_WithACopy()
    {
        Ambient();
        await SeedAsync(600);
        var inserted = false;
        _repo.AfterBatchRead = async _ =>
        {
            if (inserted) return;
            inserted = true;
            await Coll().InsertOneAsync(new BsonDocument { { "_id", "zz-late" }, { "Tag", "bd" } });
        };

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

        result.TotalImpactedData.Should().Be(601);
        AuditCount().Should().Be(601);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    [Fact]
    public async Task FailureInBatch2_Batch1StaysDeletedWithCopiesAndEvents_ErrorReturned_RetryDeletesTheRest()
    {
        Ambient();
        await SeedAsync(700);
        _repo.FailDeleteOnCall = 2;

        var act = () => Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);
        await act.Should().ThrowAsync<MongoException>();

        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(200);
        _messages.Messages.SelectMany(m => m.Ids).Should().HaveCount(500);
        AuditCount().Should().Be(700, "batch 2's copies were written before its delete failed (N5: a retry writes a second copy)");

        _repo.FailDeleteOnCall = 0;
        var retry = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);
        retry.TotalImpactedData.Should().Be(200);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        AuditCount().Should().Be(900);
    }

    [Fact]
    public async Task AuditInsertFails_TheBatchIsNotDeleted()
    {
        Ambient();
        await SeedAsync(3);
        _repo.FailAuditInsert = true;

        var act = () => Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);
        await act.Should().ThrowAsync<MongoException>();

        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(3);
        _messages.Messages.Should().BeEmpty();
    }

    [Fact]
    public async Task RequestAborted_TheLoopGoesOnToTheEnd_NoCancelCheck_AsToday()
    {
        Ambient();
        await SeedAsync(1200);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", true, cts.Token), _deleteInput);

        result.TotalImpactedData.Should().Be(1200);
        (await Coll().CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    [Fact]
    public async Task PublishThrows_RequestStillSucceeds()
    {
        Ambient();
        await SeedAsync(20);
        _messages.Fail = true;
        var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);
        result.TotalImpactedData.Should().Be(20);
    }

    [Fact]
    public async Task NoPin_EachRepositoryCallReadsTheRedisHash()
    {
        Ambient();
        await SeedAsync(501);

        await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", true), _deleteInput);

        // 3 reads (500, 1, empty) + 2 deletes = 5 repository calls = 5 hash reads.
        _cache.Verify(c => c.GetHashValueAsync(Tenant), Times.Exactly(5));
    }

    [Fact]
    public async Task LargeDocs_500x1MB_BatchesStayUnder16MB_AllDeletedWithCopiesAndEvents()
    {
        Ambient();
        await SeedAsync(500, padBytes: 1024 * 1024);
        try
        {
            var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", false), _deleteInput);

            result.TotalImpactedData.Should().Be(500);
            var nonEmpty = _repo.BatchReads.Where(b => b.Count > 0).ToList();
            nonEmpty.Should().AllSatisfy(b => b.Bytes.Should().BeLessThanOrEqualTo(MutationService.BulkDeleteMaxBatchBytes));
            nonEmpty.Count.Should().BeGreaterThanOrEqualTo(32);
            nonEmpty.Skip(1).Should().AllSatisfy(b => b.MaxDocs.Should().BeLessThanOrEqualTo(16), "the next limit follows the average size");
            AuditCount().Should().Be(500);
            _messages.Messages.SelectMany(m => m.Ids).Should().HaveCount(500).And.OnlyHaveUniqueItems();
        }
        finally
        {
            await _fixture.Client.DropDatabaseAsync(_db.DatabaseNamespace.DatabaseName);
        }
    }

    [Fact]
    public async Task LargeDocs_15MB_BatchOfOne()
    {
        Ambient();
        await SeedAsync(3, padBytes: 15 * 1024 * 1024);
        try
        {
            var result = await Service().BulkDeleteAsync(PersonSchema(), Ctx("{\"Tag\":\"bd\"}", true), _deleteInput);

            result.TotalImpactedData.Should().Be(3);
            _repo.BatchReads.Where(b => b.Count > 0).Should().HaveCount(3).And.AllSatisfy(b => b.Count.Should().Be(1));
        }
        finally
        {
            await _fixture.Client.DropDatabaseAsync(_db.DatabaseNamespace.DatabaseName);
        }
    }

    [Theory]
    [InlineData(1000L, 1, 500)]
    [InlineData(16L * 1024 * 1024, 16, 16)]
    [InlineData(16L * 1024 * 1024, 1, 1)]
    [InlineData(0L, 0, 500)]
    public void NextBatchSize_FollowsTheAverageSize(long bytes, int count, int expected) =>
        MutationService.NextBulkDeleteBatchSize(bytes, count).Should().Be(expected);

    // ---------------- helpers ----------------

    internal sealed class CapturingMessageClient : IMessageClient
    {
        public List<(List<string> Ids, int WireBytes)> Messages { get; } = new();
        public bool Fail { get; set; }

        public Task SendToConsumerAsync<T>(ConsumerMessage<T> consumerMessage) where T : class
        {
            if (Fail) throw new InvalidOperationException("broker down");
            var wire = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(JsonSerializer.Serialize(consumerMessage.Payload)));
            var ev = (DataChangeEvent)(object)consumerMessage.Payload;
            Messages.Add((ev.Data!.Select(d => IdText(d["_id"])).ToList(), wire));
            return Task.CompletedTask;
        }

        public Task SendToMassConsumerAsync<T>(ConsumerMessage<T> consumerMessage) where T : class => throw new NotSupportedException();

        private static string IdText(object? id) => id switch
        {
            string s => "s:" + s,
            int i => "i:" + i,
            long l => "l:" + l,
            _ => "o:" + JsonSerializer.Serialize(id)
        };
    }

    /// <summary>Decorator: records batch reads and delete filters, and runs hooks / injects failures.</summary>
    internal sealed class RecordingGqlRepository(IGqlDbRepository inner) : IGqlDbRepository
    {
        public List<(int Count, long Bytes, int MaxDocs)> BatchReads { get; } = new();
        public List<BsonDocument> BatchFilters { get; } = new();
        public List<BsonDocument> DeleteFilters { get; } = new();
        public Func<DocumentBatch, Task>? AfterBatchRead { get; set; }
        public int FailDeleteOnCall { get; set; }
        public bool FailAuditInsert { get; set; }
        private int _deleteCalls;

        public async Task<DocumentBatch> GetItemsBatchAsync(string collectionName, BsonDocument filter, BsonDocument sort, int maxDocs, long maxBytes)
        {
            var batch = await inner.GetItemsBatchAsync(collectionName, filter, sort, maxDocs, maxBytes);
            BatchReads.Add((batch.Documents.Count, batch.TotalBytes, maxDocs));
            BatchFilters.Add(filter);
            if (AfterBatchRead is not null && batch.Documents.Count > 0)
                await AfterBatchRead(batch);
            return batch;
        }

        public Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter)
        {
            DeleteFilters.Add(filter);
            if (++_deleteCalls == FailDeleteOnCall)
                throw new MongoException("delete failed");
            return inner.DeleteManyAsync(collectionName, filter);
        }

        public Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data) =>
            FailAuditInsert && collectionName == "ObjectAuditLogs" ? throw new MongoException("audit insert failed") : inner.InsertAsync(collectionName, data);

        public Task<BulkActionResponse> InsertManyAsync(string collectionName, List<BsonDocument> data) =>
            FailAuditInsert && collectionName == "ObjectAuditLogs" ? throw new MongoException("audit insert failed") : inner.InsertManyAsync(collectionName, data);

        public Task<BsonDocument?> GetItemAsync(string collectionName, string id) => inner.GetItemAsync(collectionName, id);
        public Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter) => inner.GetItemAsync(collectionName, filter);
        public Task<List<BsonDocument>> GetItemsAsync(string collectionName, FilterDefinition<BsonDocument> filter, BsonDocument? sort = null, BsonDocument? projection = null, int skip = 0, int limit = 10) =>
            inner.GetItemsAsync(collectionName, filter, sort, projection, skip, limit);
        public Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName, FilterDefinition<BsonDocument> filter, BsonDocument? sort = null, BsonDocument? projection = null, int skip = 0, int limit = 10) =>
            inner.GetItemsWithCountAsync(collectionName, filter, sort, projection, skip, limit);
        public Task<ActionResponse> UpdateAsync(string collectionName, BsonDocument filter, BsonDocument data) => inner.UpdateAsync(collectionName, filter, data);
        public Task<ActionResponse> UpdateManyAsync(string collectionName, BsonDocument filter, BsonDocument data) => inner.UpdateManyAsync(collectionName, filter, data);
        public Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter) => inner.DeleteAsync(collectionName, filter);
        public Task<List<CollectionsDataCount>> GetCollectionsDataCount(Dictionary<string, string> collectionToSchemaNameMap, FilterDefinition<BsonDocument>? filter = null) =>
            inner.GetCollectionsDataCount(collectionToSchemaNameMap, filter);
    }
}
