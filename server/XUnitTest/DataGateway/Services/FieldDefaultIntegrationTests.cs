using System.Collections.Immutable;
using System.Text.Json;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
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
/// Default values and validation variables end to end on a throwaway Mongo, through the real
/// MutationService and GqlDbRepository (use cases UC1, UC3, UC6, UC7, UC10–UC13, UC20, UC21).
/// </summary>
[Collection("Mongo")]
public class FieldDefaultIntegrationTests
{
    private const string Tenant = "defaults-tenant";
    private static readonly DateTime Jan10 = new(2025, 1, 10, 0, 0, 0, DateTimeKind.Utc);
    private readonly IMongoDatabase _db;
    private readonly GqlDbRepository _repo;
    private readonly InputObjectType _insertInput;
    private readonly InputObjectType _updateInput;

    public FieldDefaultIntegrationTests(MongoFixture fixture)
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
                ItemId = "access-id", SchemaName = "Access", CollectionName = "", SchemaType = SchemaType.Dto,
                Fields = [new FieldDefinition { Name = "Roles", Type = "String", IsArray = true }, new FieldDefinition { Name = "UserIds", Type = "String", IsArray = true }],
            },
            new()
            {
                ItemId = "employee-id", SchemaName = "Employee", CollectionName = "Employees", SchemaType = SchemaType.Entity,
                Fields =
                [
                    new FieldDefinition { Name = "ItemId", Type = "String" },
                    new FieldDefinition { Name = "Tags", Type = "String", IsArray = true },
                    new FieldDefinition { Name = "FirstName", Type = "String" },
                    new FieldDefinition { Name = "LastName", Type = "String" },
                    new FieldDefinition { Name = "DisplayName", Type = "String" },
                    new FieldDefinition { Name = "Code", Type = "String" },
                    new FieldDefinition { Name = "Score", Type = "Int" },
                    new FieldDefinition { Name = "StartDate", Type = "DateTime" },
                    new FieldDefinition { Name = "EndDate", Type = "DateTime" },
                    new FieldDefinition { Name = "Read", Type = "Access" },
                    new FieldDefinition { Name = "Edit", Type = "Access" },
                ],
            },
        }).GetAwaiter().GetResult();
        var builder = new GraphqlSchemaBuilder(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object), schemaRepo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        var hcSchema = schemaBuilder.Create();
        _insertInput = hcSchema.GetType<InputObjectType>("EmployeeInsertInput");
        _updateInput = hcSchema.GetType<InputObjectType>("EmployeeUpdateInput");
    }

    private static FieldDefaultValue Static(object value) => new() { Kind = DefaultValueKind.Static, Value = value };
    private static FieldDefaultValue Template(object value) => new() { Kind = DefaultValueKind.Template, Value = value };

    private static FieldDefinitionResponse F(string name, string type = "String", bool isArray = false, FieldDefaultValue? dv = null,
        RequiredOn required = RequiredOn.None, SchemaAccessLevel write = SchemaAccessLevel.Inherited, List<FieldDefinitionResponse>? children = null, params ValidationRule[] rules)
    {
        var field = Field(name, type, isArray, write: write, children: children);
        field.DefaultValue = dv;
        field.RequiredOn = required;
        if (rules.Length > 0)
            field.ValidationRule = new DataValidation { FieldName = name, Validations = rules.ToList() };
        return field;
    }

    /// <summary>Employee with the defaults of the plan's examples, plus the property under test.</summary>
    private static SchemaDefinitionExtended Employee(params FieldDefinitionResponse[] extra)
    {
        var fields = new List<FieldDefinitionResponse>
        {
            F("Tags", isArray: true, dv: Static(new object[] { "employee" })),
            F("FirstName"),
            F("LastName"),
            F("DisplayName", dv: Template("{{Employee.FirstName}} {{Employee.LastName}}")),
            F("StartDate", "DateTime"),
            F("Read", "Access", children: [F("Roles", isArray: true, dv: Static(new object[] { "admin", "app-user" })), F("UserIds", isArray: true)]),
            F("Edit", "Access", children: [F("Roles", isArray: true), F("UserIds", isArray: true, dv: Template(new object[] { "{{Auth.UserId}}" }))]),
        };
        foreach (var field in extra)
        {
            fields.RemoveAll(f => f.Name == field.Name);
            fields.Add(field);
        }
        var schema = Schema(schemaName: "Employee", collectionName: "Employees", fields: fields);
        schema.ItemId = "employee-id";
        return schema;
    }

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

    private BsonDocument Stored(string id) => _db.GetCollection<BsonDocument>("Employees").Find(new BsonDocument("_id", id)).Single();

    [Fact]
    public async Task Insert_FillsTheDefaultsOfThePlansExamples()
    {
        await Service().InsertAsync(Employee(), Ctx("{ ItemId: \"e1\", FirstName: \"Ann\", LastName: \"Lee\" }"), _insertInput);

        var row = Stored("e1");
        row["Tags"].AsBsonArray.Select(v => v.AsString).Should().Equal("employee");                   // UC1
        row["DisplayName"].AsString.Should().Be("Ann Lee");                                             // UC3
        row["Read"]["Roles"].AsBsonArray.Select(v => v.AsString).Should().Equal("admin", "app-user");  // UC6
        row["Edit"]["UserIds"].AsBsonArray.Select(v => v.AsString).Should().Equal("u1");               // UC7
    }

    [Fact]
    public async Task OrganizationIdDefault_WinsOverTheCallersOrganization()   // US-6 AC7
    {
        await Service().InsertAsync(Employee(F("OrganizationId", dv: Static("org-default"))), Ctx("{ ItemId: \"e9\" }"), _insertInput);

        Stored("e9")["OrganizationId"].AsString.Should().Be("org-default");
    }

    [Fact]
    public async Task SentValues_Win()
    {
        await Service().InsertAsync(Employee(), Ctx("{ ItemId: \"e2\", Tags: [\"x\"], DisplayName: \"Mine\" }"), _insertInput);

        var row = Stored("e2");
        row["Tags"].AsBsonArray.Select(v => v.AsString).Should().Equal("x");
        row["DisplayName"].AsString.Should().Be("Mine");
    }

    [Fact]
    public async Task RequiredWithADefault_Passes_AndDefaultsAreValidated()   // UC10, UC11
    {
        await Service().InsertAsync(Employee(F("Code", dv: Static("NEW"), required: RequiredOn.Insert)), Ctx("{ ItemId: \"e3\" }"), _insertInput);
        Stored("e3")["Code"].AsString.Should().Be("NEW");

        var tooHigh = Employee(F("Score", "Int", dv: Static(5L), rules: new ValidationRule { Type = ValidationType.Range, Value = 1, SecondaryValue = 3 }));
        var act = () => Service().InsertAsync(tooHigh, Ctx("{ ItemId: \"e4\" }"), _insertInput);
        (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors.Single().Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
    }

    [Fact]
    public async Task APropertyTheCallerCantWrite_StillGetsItsDefault()   // UC12
    {
        // Only signed-in users may write Code; an anonymous caller's value is removed, and the default fills it.
        var schema = Employee(F("Code", dv: Static("NEW"), write: SchemaAccessLevel.User));
        var service = Service();
        BlocksContext.SetContext(null);

        await service.InsertAsync(schema, Ctx("{ ItemId: \"e5\", Code: \"MINE\" }"), _insertInput);

        Stored("e5")["Code"].AsString.Should().Be("NEW");
    }

    [Fact]
    public async Task BulkInsert_EveryRowGetsDefaults_AndUpdateNeverApplies()   // UC13
    {
        var schema = Employee();
        await Service().BulkInsertAsync(schema, Ctx("[{ ItemId: \"b1\", FirstName: \"A\" }, { ItemId: \"b2\", FirstName: \"B\" }]"), _insertInput);
        Stored("b1")["DisplayName"].AsString.Should().Be("A");
        Stored("b2")["DisplayName"].AsString.Should().Be("B");

        _db.GetCollection<BsonDocument>("Employees").UpdateOne(new BsonDocument("_id", "b1"), new BsonDocument("$unset", new BsonDocument("Tags", "")));
        await Service().UpdateAsync(schema, Ctx("{ LastName: \"Z\" }", "{\"_id\":\"b1\"}"), _updateInput);

        Stored("b1").Contains("Tags").Should().BeFalse();
    }

    [Fact]
    public async Task ValidationVariable_ComparesWithAnotherProperty_AndReadsTheStoredRecordOnUpdate()   // UC20, UC21
    {
        var schema = Employee(F("EndDate", "DateTime", rules: new ValidationRule
        {
            Type = ValidationType.GreaterThan, Value = "{{Employee.StartDate}}", EvaluationVersion = 1,
        }));

        var act = () => Service().InsertAsync(schema, Ctx("{ ItemId: \"v1\", StartDate: \"2025-01-10T00:00:00Z\", EndDate: \"2025-01-05T00:00:00Z\" }"), _insertInput);
        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors.Single();
        JsonSerializer.SerializeToElement(error.Extensions!["validationErrors"]).EnumerateArray().Single()
            .GetProperty("message").GetString().Should().Be("EndDate must be greater than Employee.StartDate (2025-01-10)");

        await Service().InsertAsync(schema, Ctx("{ ItemId: \"v2\", StartDate: \"2025-01-10T00:00:00Z\", EndDate: \"2025-01-20T00:00:00Z\" }"), _insertInput);
        await Service().UpdateAsync(schema, Ctx("{ EndDate: \"2025-02-01T00:00:00Z\" }", "{\"_id\":\"v2\"}"), _updateInput);
        var tooEarly = () => Service().UpdateAsync(schema, Ctx("{ EndDate: \"2025-01-01T00:00:00Z\" }", "{\"_id\":\"v2\"}"), _updateInput);
        await tooEarly.Should().ThrowAsync<GraphQLException>();
    }
}
