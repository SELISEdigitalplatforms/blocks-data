using System.Text;
using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway;

/// <summary>
/// <see cref="DataChangeEventPublisher.PublishInChunksAsync"/> (data SPEC1 §3.3b step 3, R-EVT-*): byte-capped
/// messages measured after the double serialization Genesis does on the wire.
/// </summary>
[Collection("ContextSerial")]
public class DataChangeEventChunkTests
{
    private readonly Mock<IMessageClient> _messages = new();
    private readonly List<ConsumerMessage<DataChangeEvent>> _sent = [];
    private readonly RecordingLoggerProvider _logs = new();

    public DataChangeEventChunkTests()
    {
        _messages.Setup(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<DataChangeEvent>>()))
            .Callback<ConsumerMessage<DataChangeEvent>>(_sent.Add)
            .Returns(Task.CompletedTask);
    }

    private DataChangeEventPublisher Sut() => new(_messages.Object, _logs.CreateLogger<DataChangeEventPublisher>());

    private static SchemaDefinitionExtended Schema() => new() { SchemaName = "Client", CollectionName = "Clients" };

    private static List<BsonDocument> Docs(int count, int payloadBytes, char fill = 'x') =>
        Enumerable.Range(0, count)
            .Select(i => new BsonDocument { { "_id", $"id-{i:D5}" }, { "Body", new string(fill, payloadBytes) } })
            .ToList();

    private static int WireBytes(DataChangeEvent ev) =>
        Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(JsonSerializer.Serialize(ev)));

    private static List<string> Ids(IEnumerable<ConsumerMessage<DataChangeEvent>> sent) =>
        sent.SelectMany(m => m.Payload.Data!).Select(d => (string)d["_id"]!).ToList();

    [Fact]
    public async Task Docs500x1KB_AtLeast3Messages_EachUnderTheCap_InIdOrder_NoDuplicate()
    {
        BlocksTestContext.Set(tenantId: "t1");
        var docs = Docs(500, 1024);

        await Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, docs);

        _sent.Count.Should().BeGreaterThanOrEqualTo(3);
        _sent.Should().AllSatisfy(m => WireBytes(m.Payload).Should().BeLessThanOrEqualTo(DataChangeEventPublisher.MessageCapBytes));
        Ids(_sent).Should().Equal(docs.Select(d => d["_id"].AsString));
        _sent.Should().AllSatisfy(m => m.Payload.Operation.Should().Be(DataChangeOperation.Deleted));
    }

    [Fact]
    public async Task Docs500x100B_OneMessage()
    {
        BlocksTestContext.Set(tenantId: "t1");
        await Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, Docs(500, 100));
        _sent.Should().ContainSingle();
        _sent[0].Payload.Data.Should().HaveCount(500);
    }

    [Fact]
    public async Task OneDocOf300KB_ItsOwnMessage_AndOversizedWarning()
    {
        BlocksTestContext.Set(tenantId: "t1");
        var docs = Docs(3, 100);
        docs.Insert(1, new BsonDocument { { "_id", "big" }, { "Body", new string('y', 300 * 1024) } });

        await Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, docs);

        _sent.Should().HaveCount(3);
        _sent[1].Payload.Data.Should().ContainSingle().Which["_id"].Should().Be("big");
        Ids(_sent).Should().Equal("id-00000", "big", "id-00001", "id-00002");
        _logs.Logs.Should().Contain(l => l.Level == LogLevel.Warning && l.Message.Contains("oversized-data-event"));
    }

    [Fact]
    public async Task DocsFullOfQuotesAndBackslashes_StillUnderTheCap()
    {
        BlocksTestContext.Set(tenantId: "t1");
        await Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, Docs(400, 1024, '"').Concat(Docs(100, 1024, '\\')).ToList());

        _sent.Count.Should().BeGreaterThan(3);
        _sent.Should().AllSatisfy(m => WireBytes(m.Payload).Should().BeLessThanOrEqualTo(DataChangeEventPublisher.MessageCapBytes));
    }

    [Fact]
    public async Task PublishThrows_CaughtAndLogged_NothingThrown()
    {
        BlocksTestContext.Set(tenantId: "t1");
        _messages.Setup(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<DataChangeEvent>>())).ThrowsAsync(new InvalidOperationException("broker refused"));

        var act = () => Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, Docs(10, 100));

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task ADocThatCannotBeSerialized_NeverFailsTheRequest_OthersStillSent()
    {
        BlocksTestContext.Set(tenantId: "t1");
        var docs = Docs(3, 10);
        docs.Insert(1, new BsonDocument { { "_id", "nan" }, { "V", double.NaN } });

        var act = () => Sut().PublishInChunksAsync(Schema(), DataChangeOperation.Deleted, docs);

        await act.Should().NotThrowAsync();
        Ids(_sent).Should().Contain(["id-00000", "id-00001", "id-00002"]);
    }

    [Fact]
    public async Task SingleDeleteInsertUpdateEvents_StillOneMessage()
    {
        BlocksTestContext.Set(tenantId: "t1");
        await Sut().PublishAsync(Schema(), DataChangeOperation.Inserted, dataDocuments: Docs(500, 1024));
        _sent.Should().ContainSingle("PublishAsync is not chunked (insert/update/single delete unchanged)");
    }

    [Fact]
    public void WireSize_IsTheDoubleSerializedUtf8Size()
    {
        var doc = new BsonDocument { { "_id", "a" }, { "Q", "\"" } };
        var expected = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(JsonSerializer.Serialize(new Dictionary<string, object?> { ["_id"] = "a", ["Q"] = "\"" })));
        DataChangeEventPublisher.MeasureWireSize(doc).Should().Be(expected);
    }
}
