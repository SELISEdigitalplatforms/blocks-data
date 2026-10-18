using System.Collections.Immutable;
using System.Text.Json;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Helpers;
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
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Reference rules end to end on a throwaway Mongo: Employee.DepartmentId → Department, Employee.Skills[] → Skill,
/// Employee.ManagerId → Employee (self), Employee.DeptCode → Department.Code (not unique), Employee.BudgetRef (Int)
/// → Department.Budget (Float). Real GqlDbRepository and MutationService.
/// </summary>
[Collection("Mongo")]
public class ReferenceValidationIntegrationTests
{
    private const string Tenant = "ref-tenant";
    private readonly IMongoDatabase _db;
    private readonly GqlDbRepository _repo;
    private readonly InputObjectType _insertInput;
    private readonly InputObjectType _updateInput;
    private readonly SchemaDefinitionExtended _employee;
    private readonly ReferenceTargets _references;

    public ReferenceValidationIntegrationTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        _repo = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);

        var schemaRepo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        schemaRepo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = "employee-id", SchemaName = "Employee", CollectionName = "Employees", SchemaType = SchemaType.Entity,
                Fields =
                [
                    new FieldDefinition { Name = "ItemId", Type = "String" },
                    new FieldDefinition { Name = "Name", Type = "String" },
                    new FieldDefinition { Name = "DepartmentId", Type = "String" },
                    new FieldDefinition { Name = "Skills", Type = "String", IsArray = true },
                    new FieldDefinition { Name = "ManagerId", Type = "String" },
                    new FieldDefinition { Name = "DeptCode", Type = "String" },
                    new FieldDefinition { Name = "BudgetRef", Type = "Int" },
                ],
            },
        }).GetAwaiter().GetResult();
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        var builder = new GraphqlSchemaBuilder(resolver, schemaRepo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        var hcSchema = schemaBuilder.Create();
        _insertInput = hcSchema.GetType<InputObjectType>("EmployeeInsertInput");
        _updateInput = hcSchema.GetType<InputObjectType>("EmployeeUpdateInput");

        _employee = Entity("Employee", "Employees",
            Field("ItemId"),
            Field("Name"),
            WithReference(Field("DepartmentId"), "Department"),
            WithReference(Field("Skills", isArray: true), "Skill"),
            WithReference(Field("ManagerId"), "Employee", message: "Manager must be an existing employee"),
            WithReference(Field("DeptCode"), "Department", "Code"),
            WithReference(Field("BudgetRef", "Int"), "Department", "Budget"));
        var department = Entity("Department", "Departments", Field("Name"), Field("Code"), Field("Budget", "Float"));
        var skill = Entity("Skill", "Skills", Field("Name"));
        _references = ReferenceTargets.Build([_employee, department, skill], strict: true, NullLogger.Instance);

        Coll("Departments").InsertMany(
        [
            new BsonDocument { { "_id", "d1" }, { "Name", "Ops" }, { "Code", "OPS" }, { "Budget", 100.0 } },
            new BsonDocument { { "_id", "d2" }, { "Name", "Ops East" }, { "Code", "OPS" }, { "Budget", 250.5 } },
        ]);
        Coll("Skills").InsertMany([new BsonDocument { { "_id", "s1" } }, new BsonDocument { { "_id", "s3" } }]);
        Coll("Employees").InsertOne(new BsonDocument { { "_id", "e1" }, { "Name", "Old" }, { "DepartmentId", "gone" } });
    }

    private static SchemaDefinitionExtended Entity(string name, string collection, params FieldDefinitionResponse[] fields)
    {
        var schema = Schema(schemaName: name, collectionName: collection, fields: fields.ToList());
        schema.ItemId = $"{name.ToLowerInvariant()}-id";
        return schema;
    }

    private static FieldDefinitionResponse WithReference(FieldDefinitionResponse field, string schema, string? targetField = null, string? message = null)
    {
        field.ValidationRule = new DataValidation
        {
            FieldName = field.Name,
            Validations = [new ValidationRule { Type = ValidationType.Reference, Value = schema, SecondaryValue = targetField, ErrorMessage = message }],
        };
        return field;
    }

    private IMongoCollection<BsonDocument> Coll(string name) => _db.GetCollection<BsonDocument>(name);

    private MutationService Service()
    {
        BlocksTestContext.Set(userId: "u1", tenantId: Tenant);
        RequestContextAccessor.Current = new RequestContext { TenantId = Tenant };
        return new MutationService(_repo, Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);
    }

    private static IResolverContext Ctx(string inputLiteral, string? filterJson = null)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {inputLiteral}) {{ y }} }}");
        var literal = ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("mutationField");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(literal);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns((object?)null);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns(filterJson);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return ctx.Object;
    }

    private static List<(string Field, string Message, string Type)> ReferenceErrors(GraphQLException ex)
    {
        var error = ex.Errors.Single();
        error.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        var json = JsonSerializer.SerializeToElement(error.Extensions!["validationErrors"]);
        return json.EnumerateArray()
            .Select(e => (e.GetProperty("field").GetString()!, e.GetProperty("message").GetString()!, e.GetProperty("validationType").GetString()!))
            .ToList();
    }

    [Fact]
    public async Task Insert_WithExistingReferences_Succeeds()
    {
        var result = await Service().InsertAsync(_employee,
            Ctx("{ Name: \"Ann\", DepartmentId: \"d1\", Skills: [\"s1\", \"s3\"], DeptCode: \"OPS\", BudgetRef: 100 }"), _insertInput, _references);

        result.Acknowledged.Should().BeTrue();
        (await Coll("Employees").CountDocumentsAsync(new BsonDocument("Name", "Ann"))).Should().Be(1);
    }

    [Fact]
    public async Task Insert_MissingDepartment_FailsWithReferenceError_AndNothingIsWritten()
    {
        var act = () => Service().InsertAsync(_employee, Ctx("{ Name: \"Bob\", DepartmentId: \"nope\" }"), _insertInput, _references);

        var errors = ReferenceErrors((await act.Should().ThrowAsync<GraphQLException>()).Which);
        errors.Should().ContainSingle().Which.Should().Be(
            ("DepartmentId", "Value 'nope' of Employee.DepartmentId was not found in Department.ItemId.", "Reference"));
        (await Coll("Employees").CountDocumentsAsync(new BsonDocument("Name", "Bob"))).Should().Be(0);
    }

    [Fact]
    public async Task Insert_SkillsList_ReportsOnlyTheMissingElement()
    {
        var act = () => Service().InsertAsync(_employee, Ctx("{ Name: \"Cy\", Skills: [\"s1\", \"bad\", \"s3\"] }"), _insertInput, _references);

        var errors = ReferenceErrors((await act.Should().ThrowAsync<GraphQLException>()).Which);
        errors.Select(e => e.Field).Should().Equal("Skills[1]");
    }

    [Fact]
    public async Task Insert_EmptyListOrNoReferencedField_IsNotChecked()
    {
        await Service().InsertAsync(_employee, Ctx("{ Name: \"Di\", Skills: [] }"), _insertInput, _references);
        await Service().InsertAsync(_employee, Ctx("{ Name: \"Ed\" }"), _insertInput, _references);

        (await Coll("Employees").CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3);
    }

    [Fact]
    public async Task Insert_NonUniqueTargetField_AndIntAgainstFloat_MatchByValue()
    {
        await Service().InsertAsync(_employee, Ctx("{ Name: \"Fa\", DeptCode: \"OPS\", BudgetRef: 100 }"), _insertInput, _references);

        var act = () => Service().InsertAsync(_employee, Ctx("{ Name: \"Gu\", DeptCode: \"HR\", BudgetRef: 7 }"), _insertInput, _references);
        var errors = ReferenceErrors((await act.Should().ThrowAsync<GraphQLException>()).Which);
        errors.Select(e => e.Field).Should().BeEquivalentTo("DeptCode", "BudgetRef");
    }

    [Fact]
    public async Task BulkInsert_RowsMayReferenceEachOther_AndErrorsNameTheItem()
    {
        var ok = await Service().BulkInsertAsync(_employee,
            Ctx("[{ ItemId: \"m1\", Name: \"Boss\" }, { ItemId: \"e2\", Name: \"Hal\", ManagerId: \"m1\" }]"), _insertInput, _references);
        ok.Acknowledged.Should().BeTrue();
        (await Coll("Employees").CountDocumentsAsync(new BsonDocument("_id", new BsonDocument("$in", new BsonArray { "m1", "e2" })))).Should().Be(2);

        var act = () => Service().BulkInsertAsync(_employee,
            Ctx("[{ Name: \"Ivy\", DepartmentId: \"d1\" }, { Name: \"Jo\", ManagerId: \"nobody\" }]"), _insertInput, _references);
        var errors = ReferenceErrors((await act.Should().ThrowAsync<GraphQLException>()).Which);
        errors.Should().ContainSingle().Which.Should().Be(("ManagerId", "Item 1: Manager must be an existing employee", "Reference"));
    }

    [Fact]
    public async Task Update_ChecksOnlyTheFieldsItSends()
    {
        // e1 points at a department that no longer exists; renaming it does not re-check that.
        var renamed = await Service().UpdateAsync(_employee, Ctx("{ Name: \"New\" }", "{\"_id\":\"e1\"}"), _updateInput, _references);
        renamed.Acknowledged.Should().BeTrue();

        var act = () => Service().UpdateAsync(_employee, Ctx("{ DepartmentId: \"still-gone\" }", "{\"_id\":\"e1\"}"), _updateInput, _references);
        ReferenceErrors((await act.Should().ThrowAsync<GraphQLException>()).Which).Select(e => e.Field).Should().Equal("DepartmentId");

        await Service().BulkUpdateAsync(_employee, Ctx("{ DepartmentId: \"d2\" }", "{\"_id\":\"e1\"}"), _updateInput, _references);
        (await Coll("Employees").Find(new BsonDocument("_id", "e1")).SingleAsync())["DepartmentId"].AsString.Should().Be("d2");
    }

    [Fact]
    public async Task WithoutReferenceTargets_NothingIsChecked()
    {
        // A schema built before the targets existed (or a caller that passes none) keeps today's behaviour.
        await Service().InsertAsync(_employee, Ctx("{ Name: \"Kim\", DepartmentId: \"nope\" }"), _insertInput);

        (await Coll("Employees").CountDocumentsAsync(new BsonDocument("Name", "Kim"))).Should().Be(1);
    }
}
