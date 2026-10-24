using System.Collections.Immutable;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.GraphTypes;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
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
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// A record's OrganizationId is the caller's organization. Callers whose organization is "default",
/// root-tenant callers and calls without an authenticated user may set any OrganizationId.
/// Covers every Data Gateway record write: insert, insertMany, update, updateMany.
/// </summary>
[Collection("ContextSerial")]
public class RecordOrganizationRuleTests : IDisposable
{
    private const string OwnOrg = "org-1";
    private const string OtherOrg = "org-2";

    private readonly SchemaDefinitionExtended _schema =
        Schema(fields: [Field("ItemId"), Field("OrganizationId"), Field("Name")]);
    private readonly InputObjectType _insertInput;
    private readonly InputObjectType _updateInput;

    public RecordOrganizationRuleTests()
    {
        var map = new Dictionary<string, SchemaDefinitionExtended> { [_schema.SchemaName] = _schema };
        var hcSchema = SchemaBuilder.New()
            .AddQueryType(d => d.Name("Query").Field("ping").Type<StringType>().Resolve("pong"))
            .AddType(new InsertInputType(_schema, map))
            .AddType(new UpdateInputType(_schema, map))
            .Create();
        _insertInput = hcSchema.Types.OfType<InputObjectType>().Single(t => t.Name.EndsWith("InsertInput"));
        _updateInput = hcSchema.Types.OfType<InputObjectType>().Single(t => t.Name.EndsWith("UpdateInput"));
        Caller(OwnOrg);
    }

    public void Dispose() => ClearContext();

    // ---- callers ---------------------------------------------------------------------------------

    private static void Caller(string organizationId, bool isAuthenticated = true, bool impersonated = false, bool rootTenantKey = false)
    {
        SetContext(organizationId: organizationId, isAuthenticated: isAuthenticated, impersonated: impersonated);
        SetBlocksCloud(rootTenantKey);
    }

    private static void SystemCall()
    {
        ClearContext();
        SetBlocksCloud(false);
    }

    // ---- plumbing --------------------------------------------------------------------------------

    private sealed class Repo
    {
        public Mock<IGqlDbRepository> Mock { get; } = new();
        public List<BsonDocument> Inserted { get; } = [];
        public List<BsonDocument> Updates { get; } = [];

        public Repo()
        {
            Mock.Setup(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
                .Callback((string _, BsonDocument d) => Inserted.Add(d))
                .ReturnsAsync((string _, BsonDocument d) => d);
            Mock.Setup(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()))
                .Callback((string _, List<BsonDocument> d) => Inserted.AddRange(d))
                .ReturnsAsync((string _, List<BsonDocument> d) => new BulkActionResponse { Acknowledged = true, TotalImpactedData = d.Count });
            Mock.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
                .ReturnsAsync(new BsonDocument { { "_id", "r-1" }, { "OrganizationId", OwnOrg }, { "Name", "A" } });
            Mock.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument>
                {
                    new() { { "_id", "r-1" }, { "OrganizationId", OwnOrg } },
                    new() { { "_id", "r-2" }, { "OrganizationId", OwnOrg } },
                });
            Mock.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
                .Callback((string _, BsonDocument _, BsonDocument d) => Updates.Add(d))
                .ReturnsAsync(new ActionResponse { Acknowledged = true });
            Mock.Setup(r => r.UpdateManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
                .Callback((string _, BsonDocument _, BsonDocument d) => Updates.Add(d))
                .ReturnsAsync(new ActionResponse { Acknowledged = true });
        }

        public void VerifyNothingWritten()
        {
            Mock.Verify(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Never);
            Mock.Verify(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()), Times.Never);
            Mock.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
            Mock.Verify(r => r.UpdateManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
        }
    }

    private static MutationService Service(Repo repo) =>
        new(repo.Mock.Object, Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);

    private static IResolverContext Ctx(string inputLiteral)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {inputLiteral}) {{ y }} }}");
        var literal = ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("mutatePerson");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(literal);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns((string?)null);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return ctx.Object;
    }

    private static async Task ShouldBeRefused(Func<Task> act, Repo repo)
    {
        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors.Single();
        error.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        error.Message.Should().Contain(RecordOrganizationRule.ErrorMessage);
        repo.VerifyNothingWritten();
    }

    // ---- insert ----------------------------------------------------------------------------------

    [Fact]
    public async Task Insert_OwnOrganization_IsWritten()
    {
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OwnOrg}\" }}"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Fact]
    public async Task Insert_NoOrganization_GetsCallersOrganization()
    {
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx("{ Name: \"A\" }"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Fact]
    public async Task Insert_NullOrganization_GetsCallersOrganization()
    {
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx("{ Name: \"A\", OrganizationId: null }"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Fact]
    public async Task Insert_BlankOrganization_GetsCallersOrganization()
    {
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx("{ Name: \"A\", OrganizationId: \"\" }"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Theory]
    [InlineData(OtherOrg)]
    [InlineData("ORG-1")] // org ids are compared exactly
    [InlineData("default")]
    public async Task Insert_OtherOrganization_IsRefused(string organizationId)
    {
        var repo = new Repo();
        await ShouldBeRefused(() => Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{organizationId}\" }}"), _insertInput), repo);
    }

    [Theory]
    [InlineData("default")]
    [InlineData("Default")]
    [InlineData("")]
    public async Task Insert_DefaultOrganizationCaller_MaySetAnyOrganization(string callerOrg)
    {
        Caller(callerOrg);
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task Insert_ImpersonatedCaller_MaySetAnyOrganization()
    {
        Caller(OwnOrg, impersonated: true);
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task Insert_SystemCall_KeepsSuppliedOrganization()
    {
        SystemCall();
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task Insert_SystemCall_WithoutOrganization_IsUnchanged()
    {
        SystemCall();
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx("{ Name: \"A\" }"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().BeEmpty();
    }

    [Fact]
    public async Task Insert_UnauthenticatedContext_KeepsSuppliedOrganization()
    {
        Caller(OwnOrg, isAuthenticated: false);
        var repo = new Repo();
        await Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    // ---- insertMany ------------------------------------------------------------------------------

    [Fact]
    public async Task BulkInsert_OwnOrAbsentOrganization_AllWrittenWithCallersOrganization()
    {
        var repo = new Repo();
        await Service(repo).BulkInsertAsync(_schema, Ctx($"[{{ Name: \"A\", OrganizationId: \"{OwnOrg}\" }}, {{ Name: \"B\" }}]"), _insertInput);
        repo.Inserted.Should().HaveCount(2);
        repo.Inserted.Should().OnlyContain(d => d["OrganizationId"].AsString == OwnOrg);
    }

    [Fact]
    public async Task BulkInsert_OneRowWithOtherOrganization_RefusesWholeBatch()
    {
        var repo = new Repo();
        var act = () => Service(repo).BulkInsertAsync(_schema, Ctx($"[{{ Name: \"A\" }}, {{ Name: \"B\", OrganizationId: \"{OtherOrg}\" }}]"), _insertInput);

        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors.Single();
        error.Message.Should().Be("Item 1: " + RecordOrganizationRule.ErrorMessage);
        repo.VerifyNothingWritten();
    }

    [Fact]
    public async Task BulkInsert_DefaultOrganizationCaller_MaySetAnyOrganization()
    {
        Caller("default");
        var repo = new Repo();
        await Service(repo).BulkInsertAsync(_schema, Ctx($"[{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}]"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task BulkInsert_SystemCall_KeepsSuppliedOrganization()
    {
        SystemCall();
        var repo = new Repo();
        await Service(repo).BulkInsertAsync(_schema, Ctx($"[{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}]"), _insertInput);
        repo.Inserted.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    // ---- update ----------------------------------------------------------------------------------

    [Fact]
    public async Task Update_SameOrganization_IsWritten()
    {
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx($"{{ Name: \"B\", OrganizationId: \"{OwnOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Fact]
    public async Task Update_WithoutOrganization_LeavesItUntouched()
    {
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx("{ Name: \"B\" }"), _updateInput);
        repo.Updates.Single().Contains("OrganizationId").Should().BeFalse();
    }

    [Theory]
    [InlineData($"\"{OtherOrg}\"")]
    [InlineData("\"\"")]
    public async Task Update_MovingToAnotherOrganization_IsRefused(string organizationLiteral)
    {
        var repo = new Repo();
        await ShouldBeRefused(() => Service(repo).UpdateAsync(_schema, Ctx($"{{ Name: \"B\", OrganizationId: {organizationLiteral} }}"), _updateInput), repo);
    }

    [Fact]
    public async Task Update_NullOrganization_IsIgnoredAsToday()
    {
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx("{ Name: \"B\", OrganizationId: null }"), _updateInput);
        repo.Updates.Single().Contains("OrganizationId").Should().BeFalse();
    }

    [Fact]
    public async Task Update_DefaultOrganizationCaller_MaySetAnyOrganization()
    {
        Caller("default");
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx($"{{ OrganizationId: \"{OtherOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task Update_ImpersonatedCaller_MaySetAnyOrganization()
    {
        Caller(OwnOrg, impersonated: true);
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx($"{{ OrganizationId: \"{OtherOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task Insert_RootTenantKeyWithoutImpersonation_IsRefused()
    {
        Caller(OwnOrg, rootTenantKey: true);
        var repo = new Repo();
        await ShouldBeRefused(() => Service(repo).InsertAsync(_schema, Ctx($"{{ Name: \"A\", OrganizationId: \"{OtherOrg}\" }}"), _insertInput), repo);
    }

    [Fact]
    public async Task Update_SystemCall_KeepsSuppliedOrganization()
    {
        SystemCall();
        var repo = new Repo();
        await Service(repo).UpdateAsync(_schema, Ctx($"{{ OrganizationId: \"{OtherOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    // ---- updateMany ------------------------------------------------------------------------------

    [Fact]
    public async Task BulkUpdate_SameOrganization_IsWritten()
    {
        var repo = new Repo();
        await Service(repo).BulkUpdateAsync(_schema, Ctx($"{{ Name: \"B\", OrganizationId: \"{OwnOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OwnOrg);
    }

    [Fact]
    public async Task BulkUpdate_MovingToAnotherOrganization_IsRefused()
    {
        var repo = new Repo();
        await ShouldBeRefused(() => Service(repo).BulkUpdateAsync(_schema, Ctx($"{{ Name: \"B\", OrganizationId: \"{OtherOrg}\" }}"), _updateInput), repo);
    }

    [Fact]
    public async Task BulkUpdate_DefaultOrganizationCaller_MaySetAnyOrganization()
    {
        Caller("default");
        var repo = new Repo();
        await Service(repo).BulkUpdateAsync(_schema, Ctx($"{{ OrganizationId: \"{OtherOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }

    [Fact]
    public async Task BulkUpdate_SystemCall_KeepsSuppliedOrganization()
    {
        SystemCall();
        var repo = new Repo();
        await Service(repo).BulkUpdateAsync(_schema, Ctx($"{{ OrganizationId: \"{OtherOrg}\" }}"), _updateInput);
        repo.Updates.Single()["OrganizationId"].AsString.Should().Be(OtherOrg);
    }
}
