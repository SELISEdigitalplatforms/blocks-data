using System.Collections.Immutable;
using System.Text.Json;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
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
/// The rules added by the validation and access rules plan, end to end through <see cref="MutationService"/> on a
/// throwaway Mongo (phase 5): "only when" on insert, update and bulk update; the reference filter, deleted target rows
/// and Must not exist in; batch rows that point at each other through a filter. Kept apart from
/// <c>ReferenceValidationIntegrationTests</c>, which must stay unmodified (G4).
/// </summary>
[Collection("Mongo")]
public class NewRulesMutationIntegrationTests
{
    private const string Tenant = "newrules-tenant";
    private readonly MongoFixture _fixture;
    private readonly IMongoDatabase _db;
    private readonly GqlDbRepository _repo;
    private readonly InputObjectType _insertInput;
    private readonly InputObjectType _updateInput;
    private readonly SchemaDefinitionExtended _invoice;
    private readonly ReferenceTargets _references;

    private static PolicyRuleGroup Where(string field, object value) => new()
    {
        Rules = [new() { LeftOperand = field, Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = value }],
    };

    public NewRulesMutationIntegrationTests(MongoFixture fixture)
    {
        _fixture = fixture;
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

        string[] fieldNames = ["ItemId", "Country", "VatNumber", "CustomerId", "Email", "Tags", "ParentId"];
        var schemaRepo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        schemaRepo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = "invoice-id", SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity,
                Fields = fieldNames.Select(n => new FieldDefinition { Name = n, Type = "String", IsArray = n == "Tags" }).ToList(),
            },
        }).GetAwaiter().GetResult();
        var builder = new GraphqlSchemaBuilder(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object), schemaRepo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        var hcSchema = schemaBuilder.Create();
        _insertInput = hcSchema.GetType<InputObjectType>("InvoiceInsertInput");
        _updateInput = hcSchema.GetType<InputObjectType>("InvoiceUpdateInput");

        _invoice = Entity("Invoice", "Invoices",
            Field("ItemId"),
            Field("Country"),
            WithRules(Field("VatNumber"), new ValidationRule { Type = ValidationType.NotEmpty, When = Where("Country", "DE"), EvaluationVersion = 1 }),
            WithRules(Field("CustomerId"), new ValidationRule { Type = ValidationType.Reference, Value = "Customer", SecondaryValue = "ItemId", EvaluationVersion = 2, TargetFilter = Where("Status", "Active") }),
            WithRules(Field("Email"), new ValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" }),
            WithRules(Field("Tags", isArray: true), new ValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" }),
            WithRules(Field("ParentId"), new ValidationRule { Type = ValidationType.Reference, Value = "Invoice", SecondaryValue = "ItemId", EvaluationVersion = 2, TargetFilter = Where("Country", "AT") }));
        var customer = Entity("Customer", "Customers", Field("Status"));
        var blocklist = Entity("Blocklist", "Blocklists", Field("Email"));
        _references = ReferenceTargets.Build([_invoice, customer, blocklist], strict: true, NullLogger.Instance);

        Coll("Customers").InsertMany(
        [
            new BsonDocument { { "_id", "c1" }, { "Status", "Active" } },
            new BsonDocument { { "_id", "c2" }, { "Status", "Inactive" } },
            new BsonDocument { { "_id", "c3" }, { "Status", "Active" }, { "IsDeleted", true } },
        ]);
        Coll("Blocklists").InsertMany(
        [
            new BsonDocument { { "_id", "b1" }, { "Email", "spam@x.io" } },
            new BsonDocument { { "_id", "b2" }, { "Email", "old@x.io" }, { "IsDeleted", true } },
        ]);
        Coll("Invoices").InsertMany(
        [
            new BsonDocument { { "_id", "inv-de" }, { "Country", "DE" }, { "VatNumber", "DE1" } },
            new BsonDocument { { "_id", "inv-at" }, { "Country", "AT" } },
        ]);
    }

    private static SchemaDefinitionExtended Entity(string name, string collection, params FieldDefinitionResponse[] fields)
    {
        var schema = Schema(schemaName: name, collectionName: collection, fields: fields.ToList());
        schema.ItemId = $"{name.ToLowerInvariant()}-id";
        return schema;
    }

    private static FieldDefinitionResponse WithRules(FieldDefinitionResponse field, params ValidationRule[] rules)
    {
        field.ValidationRule = new DataValidation { FieldName = field.Name, Validations = [.. rules] };
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

    private static List<(string Field, string Message, string Type)> Errors(GraphQLException ex)
    {
        var error = ex.Errors.Single();
        error.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        var json = JsonSerializer.SerializeToElement(error.Extensions!["validationErrors"]);
        return json.EnumerateArray()
            .Select(e => (e.GetProperty("field").GetString()!, e.GetProperty("message").GetString()!, e.GetProperty("validationType").GetString()!))
            .ToList();
    }

    private async Task<List<(string Field, string Message, string Type)>> Refused(Func<Task> act) =>
        Errors((await act.Should().ThrowAsync<GraphQLException>()).Which);

    // ── "Only when" ──

    [Fact]
    public async Task Insert_RequiredWhen_ChecksAPropertyThatWasNotSent()
    {
        var errors = await Refused(() => Service().InsertAsync(_invoice, Ctx("{ Country: \"DE\" }"), _insertInput, _references));
        errors.Should().ContainSingle().Which.Should().Match<(string Field, string Message, string Type)>(e => e.Field == "VatNumber" && e.Type == "NotEmpty");

        (await Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\" }"), _insertInput, _references)).Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task Update_ReadsTheConditionFromTheStoredRecord()
    {
        var errors = await Refused(() => Service().UpdateAsync(_invoice, Ctx("{ VatNumber: \"\" }", "{\"_id\":\"inv-de\"}"), _updateInput, _references));
        errors.Select(e => e.Field).Should().Equal("VatNumber");

        (await Service().UpdateAsync(_invoice, Ctx("{ VatNumber: \"\" }", "{\"_id\":\"inv-at\"}"), _updateInput, _references)).Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task BulkUpdate_ChecksEachMatchedRecord_AndNamesIt()
    {
        var both = "{\"_id\":{\"$in\":[\"inv-de\",\"inv-at\"]}}";
        var errors = await Refused(() => Service().BulkUpdateAsync(_invoice, Ctx("{ VatNumber: \"\" }", both), _updateInput, _references));
        errors.Should().ContainSingle().Which.Message.Should().StartWith("Record inv-de: ");

        (await Service().BulkUpdateAsync(_invoice, Ctx("{ VatNumber: \"\" }", "{\"_id\":\"inv-at\"}"), _updateInput, _references)).Acknowledged.Should().BeTrue();
        (await Coll("Invoices").Find(new BsonDocument("_id", "inv-de")).SingleAsync())["VatNumber"].AsString.Should().Be("DE1");
    }

    // ── Reference with a filter, deleted rows, Must not exist in ──

    [Fact]
    public async Task Reference_WithAFilter_AndDeletedRows()
    {
        (await Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", CustomerId: \"c1\" }"), _insertInput, _references)).Acknowledged.Should().BeTrue();

        (await Refused(() => Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", CustomerId: \"c2\" }"), _insertInput, _references)))
            .Should().ContainSingle().Which.Should().Be(("CustomerId", "Value 'c2' of Invoice.CustomerId was not found in Customer.ItemId.", "Reference"));
        (await Refused(() => Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", CustomerId: \"c3\" }"), _insertInput, _references)))
            .Select(e => e.Field).Should().Equal("CustomerId");
    }

    [Fact]
    public async Task MustNotExistIn_RefusesAFoundValue_IgnoresDeletedRows_AndChecksListItems()
    {
        (await Refused(() => Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", Email: \"spam@x.io\" }"), _insertInput, _references)))
            .Should().ContainSingle().Which.Should().Be(("Email", "Value 'spam@x.io' of Invoice.Email already exists in Blocklist.Email.", "NotExistsIn"));

        (await Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", Email: \"old@x.io\" }"), _insertInput, _references)).Acknowledged.Should().BeTrue();

        (await Refused(() => Service().InsertAsync(_invoice, Ctx("{ Country: \"AT\", Tags: [\"a@x.io\", \"spam@x.io\"] }"), _insertInput, _references)))
            .Select(e => e.Field).Should().Equal("Tags[1]");
    }

    [Fact]
    public async Task BulkInsert_ARowCountsForAFilteredReference_OnlyWhenItMatchesTheFilter()
    {
        var ok = await Service().BulkInsertAsync(_invoice,
            Ctx("[{ ItemId: \"p1\", Country: \"AT\" }, { ItemId: \"k1\", Country: \"AT\", ParentId: \"p1\" }]"), _insertInput, _references);
        ok.Acknowledged.Should().BeTrue();

        (await Refused(() => Service().BulkInsertAsync(_invoice,
                Ctx("[{ ItemId: \"p2\", Country: \"CH\" }, { ItemId: \"k2\", Country: \"AT\", ParentId: \"p2\" }]"), _insertInput, _references)))
            .Should().ContainSingle().Which.Should().Be(("ParentId", "Item 1: Value 'p2' of Invoice.ParentId was not found in Invoice.ItemId.", "Reference"));
    }

    // ── G4: an older rule sends today's lookup ──

    [Fact]
    public async Task AnUnfilteredVersion1Reference_MakesTodaysRepositoryCall()
    {
        var oldRule = Entity("Invoice", "Invoices", Field("ItemId"), Field("Country"),
            WithRules(Field("CustomerId"), new ValidationRule { Type = ValidationType.Reference, Value = "Customer", EvaluationVersion = 1 }));
        var references = ReferenceTargets.Build([oldRule, Entity("Customer", "Customers", Field("Status"))], strict: true, NullLogger.Instance);
        var repository = new Mock<IGqlDbRepository>();
        repository.Setup(r => r.GetDistinctValuesAsync("Customers", "_id", It.IsAny<IReadOnlyCollection<BsonValue>>()))
            .ReturnsAsync([BsonValue.Create("c3")]);
        BlocksTestContext.Set(userId: "u1", tenantId: Tenant);
        RequestContextAccessor.Current = new RequestContext { TenantId = Tenant };
        var service = new MutationService(repository.Object, Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);

        await service.InsertAsync(oldRule, Ctx("{ Country: \"AT\", CustomerId: \"c3\" }"), _insertInput, references);

        repository.Verify(r => r.GetDistinctValuesAsync("Customers", "_id", It.Is<IReadOnlyCollection<BsonValue>>(v => v.Single() == "c3")), Times.Once);
        repository.Verify(r => r.GetDistinctValuesAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<IReadOnlyCollection<BsonValue>>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    // ── Found in review ──

    /// <summary>A repository for a tenant on its own data source: the tenant's records live in <paramref name="custom"/>.</summary>
    private GqlDbRepository CustomSourceRepository(IMongoDatabase custom)
    {
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(true, "custom-secret", "custom", "1"));
        var clients = new Mock<IDataSourceClientCache>();
        clients.Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(custom);
        return new GqlDbRepository(provider.Object, cache.Object, clients.Object, store.Object);
    }

    [Fact]
    public async Task ASystemTarget_IsLookedUpInTheTenantsDefaultDatabase_EvenOnACustomDataSource()
    {
        // IAM writes Users into the tenant's default database; the tenant's own records live on its data source.
        Coll("Users").InsertOne(new BsonDocument { { "_id", "u1" }, { "Email", "taken@x.io" } });
        var custom = _fixture.CreateDatabase();
        custom.GetCollection<BsonDocument>("Customers").InsertOne(new BsonDocument { { "_id", "c9" }, { "Status", "Active" } });
        var lead = Entity("Invoice", "Invoices", Field("ItemId"), Field("Country"),
            WithRules(Field("Email"), new ValidationRule { Type = ValidationType.NotExistsIn, Value = "User", SecondaryValue = "Email" }),
            WithRules(Field("CustomerId"), new ValidationRule { Type = ValidationType.Reference, Value = "Customer", SecondaryValue = "ItemId", EvaluationVersion = 2 }));
        var user = Entity("User", "Users", Field("Email"));
        user.IsSystemEntity = true;
        var references = ReferenceTargets.Build([lead, user, Entity("Customer", "Customers", Field("Status"))], strict: true, NullLogger.Instance);
        BlocksTestContext.Set(userId: "u1", tenantId: Tenant);
        RequestContextAccessor.Current = new RequestContext { TenantId = Tenant };
        var service = new MutationService(CustomSourceRepository(custom), Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);

        (await Refused(() => service.InsertAsync(lead, Ctx("{ Country: \"AT\", Email: \"taken@x.io\" }"), _insertInput, references)))
            .Select(e => e.Type).Should().Equal("NotExistsIn");
        // A tenant target still reads the tenant's own source.
        (await service.InsertAsync(lead, Ctx("{ Country: \"AT\", Email: \"free@x.io\", CustomerId: \"c9\" }"), _insertInput, references)).Acknowledged.Should().BeTrue();
        (await custom.GetCollection<BsonDocument>("Invoices").CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(1);
    }

    [Fact]
    public async Task AFilterPatternMongoCantRun_RefusesTheValue_InsteadOfCrashingTheWrite()
    {
        var rule = new ValidationRule
        {
            Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email",
            TargetFilter = new PolicyRuleGroup { Rules = [new() { LeftOperand = "Email", Operator = PolicyOperator.REGEX, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "(?<a>x)(?<-a>)" }] },
        };
        var invoice = Entity("Invoice", "Invoices", Field("ItemId"), Field("Country"), WithRules(Field("Email"), rule));
        var references = ReferenceTargets.Build([invoice, Entity("Blocklist", "Blocklists", Field("Email"))], strict: true, NullLogger.Instance);

        (await Refused(() => Service().InsertAsync(invoice, Ctx("{ Country: \"AT\", Email: \"spam@x.io\" }"), _insertInput, references)))
            .Should().ContainSingle().Which.Message.Should().Be(DataValidationHelper.ConditionNotChecked);
    }

    [Fact]
    public async Task BulkUpdate_ReportsAtMost50RecordErrors()
    {
        Coll("Invoices").InsertMany(Enumerable.Range(0, 60).Select(i => new BsonDocument { { "_id", $"de{i}" }, { "Country", "DE" }, { "VatNumber", "x" } }));

        var errors = await Refused(() => Service().BulkUpdateAsync(_invoice, Ctx("{ VatNumber: \"\" }", "{\"Country\":\"DE\"}"), _updateInput, _references));

        // The service stops at 50 record errors (and records); the error payload shows the first ones.
        errors.Should().NotBeEmpty().And.HaveCountLessThanOrEqualTo(50);
        errors.Should().OnlyContain(e => e.Message.StartsWith("Record de") || e.Message.StartsWith("Record inv-de"));
    }
}
