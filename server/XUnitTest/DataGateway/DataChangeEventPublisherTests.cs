using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using Moq;

namespace XUnitTest.DataGateway
{
    /// <summary>
    /// Unit tests for <see cref="DataChangeEventPublisher"/>. The publisher is deliberately
    /// best-effort: it resolves the tenant from the ambient context, skips silently when there is
    /// none, and swallows transport failures so a publish never fails the mutation that triggered
    /// it. All three behaviours are pinned here.
    /// </summary>
    public class DataChangeEventPublisherTests : IDisposable
    {
        private readonly Mock<IMessageClient> _messages = new();
        private readonly DataChangeEventPublisher _sut;
        private readonly List<ConsumerMessage<DataChangeEvent>> _sent = [];

        public DataChangeEventPublisherTests()
        {
            BlocksContext.IsTestMode = true;

            _messages.Setup(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<DataChangeEvent>>()))
                     .Callback<ConsumerMessage<DataChangeEvent>>(_sent.Add)
                     .Returns(Task.CompletedTask);

            _sut = new DataChangeEventPublisher(_messages.Object, NullLogger<DataChangeEventPublisher>.Instance);
        }

        public void Dispose()
        {
            BlocksContext.SetContext(null);
            BlocksContext.IsTestMode = false;
        }

        private static void SetTenant(string? tenantId) =>
            BlocksContext.SetContext(tenantId is null
                ? null
                : BlocksContext.Create(tenantId, null, "user-1", true, null, null,
                    DateTime.UtcNow.AddHours(1), null, null, null, null, null, null, "", tenantId));

        private static SchemaDefinitionExtended Schema(string name = "Client") => new()
        {
            SchemaName = name,
            CollectionName = name + "s",
        };

        private static BsonDocument Doc(string id) => new() { { "_id", id }, { "Name", "row-" + id } };

        [Fact]
        public async Task PublishAsync_SendsTheEventToTheDataChangeQueue()
        {
            SetTenant("tenant-1");

            await _sut.PublishAsync(Schema(), DataChangeOperation.Inserted, [Doc("1")]);

            _sent.Should().ContainSingle();
            _sent[0].ConsumerName.Should().Be(GraphQlConstant.DataChangeTriggerQueue);
        }

        [Fact]
        public async Task PublishAsync_CarriesTheSchemaCollectionAndOperation()
        {
            SetTenant("tenant-1");

            await _sut.PublishAsync(Schema("Order"), DataChangeOperation.Updated);

            var payload = _sent.Single().Payload;
            payload.ProjectKey.Should().Be("tenant-1");
            payload.SchemaName.Should().Be("Order");
            payload.CollectionName.Should().Be("Orders");
            payload.Operation.Should().Be(DataChangeOperation.Updated);
            payload.Timestamp.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
        }

        [Fact]
        public async Task PublishAsync_ConvertsEachBsonDocumentIntoTheEventPayload()
        {
            SetTenant("tenant-1");

            await _sut.PublishAsync(Schema(), DataChangeOperation.Inserted, [Doc("1"), Doc("2")]);

            var payload = _sent.Single().Payload;
            payload.Data.Should().HaveCount(2);
            payload.Data![0].Should().ContainKey("Name");
        }

        [Fact]
        public async Task PublishAsync_CarriesUpdatedDocumentsWhenGivenInsteadOfData()
        {
            SetTenant("tenant-1");
            var updated = new List<UpdatedDocument> { new() };

            await _sut.PublishAsync(Schema(), DataChangeOperation.Updated, updatedDocuments: updated);

            var payload = _sent.Single().Payload;
            payload.UpdatedDocuments.Should().BeSameAs(updated);
            payload.Data.Should().BeNull();
        }

        [Fact]
        public async Task PublishAsync_StillPublishesWhenNeitherDocumentListIsGiven()
        {
            SetTenant("tenant-1");

            await _sut.PublishAsync(Schema(), DataChangeOperation.Deleted);

            _sent.Should().ContainSingle();
            _sent[0].Payload.Data.Should().BeNull();
            _sent[0].Payload.UpdatedDocuments.Should().BeNull();
        }

        [Fact]
        public async Task PublishAsync_SkipsSilentlyWhenThereIsNoTenantInContext()
        {
            SetTenant(null);

            await _sut.PublishAsync(Schema(), DataChangeOperation.Inserted, [Doc("1")]);

            _messages.Verify(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<DataChangeEvent>>()), Times.Never);
        }

        [Fact]
        public async Task PublishAsync_SwallowsATransportFailureSoTheMutationIsNotAffected()
        {
            SetTenant("tenant-1");
            _messages.Setup(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<DataChangeEvent>>()))
                     .ThrowsAsync(new InvalidOperationException("broker down"));

            var act = () => _sut.PublishAsync(Schema(), DataChangeOperation.Inserted, [Doc("1")]);

            await act.Should().NotThrowAsync();
        }

        [Theory]
        [InlineData(DataChangeOperation.Inserted)]
        [InlineData(DataChangeOperation.Updated)]
        [InlineData(DataChangeOperation.Deleted)]
        public async Task PublishAsync_HandlesEveryOperation(DataChangeOperation operation)
        {
            SetTenant("tenant-1");

            await _sut.PublishAsync(Schema(), operation, [Doc("1")]);

            _sent.Single().Payload.Operation.Should().Be(operation);
        }
    }
}
