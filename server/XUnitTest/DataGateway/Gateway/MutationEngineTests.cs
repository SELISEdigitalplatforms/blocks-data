using System.Diagnostics;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The mutation half of the gateway engine, called without GraphQL. The input is lazy: the engine reads it
/// only where the GraphQL path parsed it, so an access refusal or a no-match comes before an invalid input.
/// </summary>
[Collection("ContextSerial")]
public class MutationEngineTests : IDisposable
{
    // The resolver's refusal message, which PrepareMutation passes through as it always has.
    private const string ForbiddenWriteMessage = "No policy grants access to this resource.";
    private const string GeoJsonMessage = "Invalid GeoJson value for field 'Location': coordinates are missing";

    private readonly Mock<IGqlDbRepository> _repo = new();
    private readonly Mock<IDataChangeEventPublisher> _publisher = new();

    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private MongoGatewayDataEngine Engine() =>
        new(_repo.Object, Resolver(), Principals(), NullLogger.Instance, eventPublisher: _publisher.Object);

    /// <summary>A record that fails to build the way an invalid GeoJson literal does, and remembers being read.</summary>
    private sealed class ThrowingInput<T>
    {
        public ThrowingInput() =>
            Lazy = new Lazy<T>(() =>
            {
                Evaluated = true;
                throw new InvalidCastException(GeoJsonMessage);
            });

        public bool Evaluated { get; private set; }

        public Lazy<T> Lazy { get; }
    }

    private void VerifyNothingWritten()
    {
        _repo.Verify(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Never);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task Insert_AnonymousWithInvalidGeoJson_FailsOnAccessNotGeoJson()
    {
        // An anonymous caller on a Custom entity with no policy that allows the write: PrepareMutation refuses it.
        // (A User-level entity is refused for an anonymous caller by the schema-access middleware, before
        // MutationService runs; that is the AUTH_NOT_AUTHENTICATED of the insert-anonymous golden. The policy
        // check in the engine grants non-Custom levels, so the refusal tested here is the engine's own.)
        SetContext(userId: string.Empty, userName: string.Empty, isAuthenticated: false);
        SetBlocksCloud(false);
        using var activity = new Activity("request").Start();
        var schema = Schema(write: SchemaAccessLevel.Custom, fields: new() { Field("Title"), Field("Location", "GeoJson") });
        var input = new ThrowingInput<Dictionary<string, object?>>();

        var act = () => Engine().InsertAsync(new EntityModel(schema, null), new InsertCommand("insertPerson", input.Lazy));

        var ex = (await act.Should().ThrowAsync<GatewayException>()).Which;
        // PrepareMutation's refusal: the code and message MutationService threw before the move.
        ex.Code.Should().Be(GraphQlConstant.ForbiddenErrorCode);
        ex.Message.Should().Be(ForbiddenWriteMessage);
        ex.FieldErrors.Should().BeNull();
        input.Evaluated.Should().BeFalse();
        GatewayOperationActivity.GetOrCreate(activity).FailureKind.Should().Be(GatewayFailureKind.Authorization);
        GatewayOperationActivity.GetOrCreate(activity).FailureCode.Should().Be(GraphQlConstant.ForbiddenErrorCode);
        VerifyNothingWritten();
    }

    [Fact]
    public async Task Update_NoMatchWithInvalidGeoJson_ReturnsNotFound()
    {
        SetContext();
        SetBlocksCloud(false);
        _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync((BsonDocument?)null);
        var schema = Schema(fields: new() { Field("Title"), Field("Location", "GeoJson") });
        var where = new WhereNode(new Dictionary<string, object?>
        {
            ["Title"] = new Dictionary<string, object?> { ["eq"] = "nothing has this" }
        });
        var changes = new ThrowingInput<Dictionary<string, object?>>();

        var result = await Engine().UpdateAsync(
            new EntityModel(schema, null), new UpdateCommand("updatePerson", where, changes.Lazy));

        result.Acknowledged.Should().BeFalse();
        result.Message.Should().Be("No data found to UPDATE or you don't have permission to UPDATE this record.");
        changes.Evaluated.Should().BeFalse();
        VerifyNothingWritten();
    }

    [Fact]
    public async Task UpdateMany_NoMatchWithInvalidGeoJson_ReturnsNotFound()
    {
        SetContext();
        SetBlocksCloud(false);
        _repo.Setup(r => r.GetItemsAsync(
                It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument?>(),
                It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument>());
        var schema = Schema(fields: new() { Field("Title"), Field("Location", "GeoJson") });
        var changes = new ThrowingInput<Dictionary<string, object?>>();

        var result = await Engine().UpdateManyAsync(
            new EntityModel(schema, null), new UpdateManyCommand("updateManyPerson", null, changes.Lazy, "{}"));

        result.Acknowledged.Should().BeFalse();
        changes.Evaluated.Should().BeFalse();
    }

    [Fact]
    public async Task Validation_ThrowsGatewayExceptionWithFieldErrors()
    {
        SetContext();
        SetBlocksCloud(false);
        using var activity = new Activity("request").Start();
        var name = new FieldDefinitionResponse { Name = "Name", Type = "String", RequiredOn = RequiredOn.Insert };
        var schema = Schema(fields: new() { name, Field("Age", "Int") });
        var record = new Lazy<Dictionary<string, object?>>(() => new Dictionary<string, object?> { ["Age"] = 3 });

        var act = () => Engine().InsertAsync(new EntityModel(schema, null), new InsertCommand("insertPerson", record));

        var ex = (await act.Should().ThrowAsync<GatewayException>()).Which;
        ex.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        ex.Message.Should().Be("Required fields are missing or empty.");
        ex.FieldErrors.Should().BeEquivalentTo(new[]
        {
            new GatewayFieldError("Name", "Field 'Name' is required for insert.", "Required")
        });
        GatewayOperationActivity.GetOrCreate(activity).FailureKind.Should().Be(GatewayFailureKind.Validation);
        VerifyNothingWritten();
    }

    [Fact]
    public async Task Insert_WithoutEventPublisher_ThrowsBeforeWriting()
    {
        SetContext();
        SetBlocksCloud(false);
        var engine = new MongoGatewayDataEngine(_repo.Object, Resolver(), Principals(), NullLogger.Instance);
        var record = new Lazy<Dictionary<string, object?>>(() => new Dictionary<string, object?> { ["Name"] = "Ann" });

        var act = () => engine.InsertAsync(new EntityModel(Schema(fields: new() { Field("Name") }), null), new InsertCommand("insertPerson", record));

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("MongoGatewayDataEngine was created without an event publisher");
        VerifyNothingWritten();
    }
}
