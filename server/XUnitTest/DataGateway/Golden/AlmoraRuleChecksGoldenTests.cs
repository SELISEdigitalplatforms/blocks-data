using System.Text;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using HotChocolate;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using Moq;
using Xunit.Abstractions;

namespace XUnitTest.DataGateway.Golden;

/// <summary>
/// G12 (validation and access rules plan): every validation rule in a tenant export still saves, imports and publishes.
/// Runs each stored rule through the paths that check rules, as the console or an import would send it back: the
/// validation API's create and update validators, the import validator, and a strict (publish) schema build. Every
/// message is written to DATA_GATEWAY_RULE_CHECKS_OUT when it is set, so a run on the commit before a change and one
/// after can be diffed: there must be no new message. Like <see cref="ClsDumpGoldenTests"/>, it runs only where an export
/// is present (db-scripts/almora/dg, git-ignored, or DATA_GATEWAY_GOLDEN_DUMP).
/// </summary>
[Collection("ContextSerial")]
public class AlmoraRuleChecksGoldenTests
{
    private const string DumpDirVariable = "DATA_GATEWAY_GOLDEN_DUMP";
    private const string OutVariable = "DATA_GATEWAY_RULE_CHECKS_OUT";

    private readonly ITestOutputHelper _output;

    public AlmoraRuleChecksGoldenTests(ITestOutputHelper output) => _output = output;

    [Fact]
    [Trait("Category", "LocalDump")]
    public async Task StoredRules_GoThroughEverySavePath()
    {
        var dumpDir = FindDumpDir();
        if (dumpDir is null)
        {
            _output.WriteLine($"No tenant export found; set {DumpDirVariable} to run this test.");
            return;
        }

        var (schemas, validations, policies) = LoadDump(dumpDir);
        var messages = await CheckAsync(schemas, validations, policies);

        _output.WriteLine($"{validations.Count} validations, {validations.Sum(v => v.Validations.Count)} rules, {messages.Count} messages");
        foreach (var message in messages)
            _output.WriteLine(message);
        if (Environment.GetEnvironmentVariable(OutVariable) is { Length: > 0 } outFile)
            await System.IO.File.WriteAllTextAsync(outFile, string.Join("\n", messages) + "\n", new UTF8Encoding(false));
    }

    [Fact]
    [Trait("Category", "LocalDump")]
    public async Task TheCheck_CatchesARuleThatCannotBeSaved_InEveryPath()
    {
        // A control: a rule no version accepts (a Reference to a schema that doesn't exist) must be reported by
        // every path, so a run without messages means the rules passed, not that the paths weren't reached.
        var dumpDir = FindDumpDir();
        if (dumpDir is null)
            return;

        var (schemas, validations, policies) = LoadDump(dumpDir);
        var schema = schemas.First(s => !s.IsDeleted && !s.IsSystemEntity && s.SchemaType == SchemaType.Entity && s.Fields.Any(f => f.Type == "String" && !f.IsArray && !f.IsReferenceField));
        var field = schema.Fields.First(f => f.Type == "String" && !f.IsArray && !f.IsReferenceField);
        validations.Add(new DataValidation
        {
            ItemId = "control", SchemaId = schema.ItemId, FieldName = field.Name,
            Validations = [new ValidationRule { Type = ValidationType.Reference, Value = "NoSuchSchema", SecondaryValue = "ItemId", IsActive = true }],
        });

        var paths = (await CheckAsync(schemas, validations, policies)).Select(m => m.Split(" | ")[0]).Distinct().Order().ToList();

        Assert.Equal(["create", "import", "publish", "update"], paths);
    }

    private static (List<SchemaDefinition> Schemas, List<DataValidation> Validations, List<DataAccessPolicy> Policies) LoadDump(string dumpDir)
    {
        var prefix = Directory.GetFiles(dumpDir, "*.SchemaDefinitions.json").Single()[..^".SchemaDefinitions.json".Length];
        return (
            Load<SchemaDefinition>(prefix + ".SchemaDefinitions.json"),
            Load<DataValidation>(prefix + ".DataValidations.json").Where(v => !v.IsDeleted).ToList(),
            Load<DataAccessPolicy>(prefix + ".DataAccessPolicys.json").Where(p => !p.IsDeleted).ToList());
    }

    /// <summary>Every message the save paths give for the stored rules, sorted: "create | Schema.Field | message", "import | …", "publish | …".</summary>
    private static async Task<List<string>> CheckAsync(List<SchemaDefinition> schemas, List<DataValidation> validations, List<DataAccessPolicy> policies)
    {
        var repository = RepositoryOver(schemas);
        var messages = new List<string>();

        foreach (var validation in validations)
        {
            var schema = schemas.SingleOrDefault(s => s.ItemId == validation.SchemaId);
            var name = $"{schema?.SchemaName ?? validation.SchemaId}.{validation.FieldName}";
            var rules = validation.Validations.Select(ToRequest).ToList();

            var create = await new CreateDataValidationRequestValidator(repository).ValidateAsync(
                new CreateDataValidationRequest { SchemaId = validation.SchemaId, FieldName = validation.FieldName, Validations = rules });
            messages.AddRange(create.Errors.Select(e => $"create | {name} | {e.ErrorMessage}"));

            var update = await new UpdateDataValidationRequestValidator(repository).ValidateAsync(
                new UpdateDataValidationRequest { ItemId = validation.ItemId, SchemaId = validation.SchemaId, FieldName = validation.FieldName, Validations = rules });
            messages.AddRange(update.Errors.Select(e => $"update | {name} | {e.ErrorMessage}"));
        }

        var documents = schemas.Where(s => !s.IsDeleted && !s.IsSystemEntity).ToList()
            .MapToExportDocuments(policies, validations, SchemaExportOption.All);
        messages.AddRange((await new SchemaImportValidator(repository).ValidateAsync(documents)).Select(e => $"import | {e}"));

        try
        {
            var source = new SchemaSource { SchemaDefinitions = schemas.Where(s => !s.IsDeleted && !s.IsSystemEntity).ToList(), DataValidations = validations, DataAccessPolicies = policies };
            new GraphqlSchemaBuilder(new SchemaResolver(Mock.Of<IMutationService>(), Mock.Of<IQueryService>()), repository, NullLogger<GraphqlSchemaBuilder>.Instance)
                .BuildSchema("almora", source, SchemaBuilder.New(), strictReferences: true);
        }
        catch (Exception ex)
        {
            messages.Add($"publish | {ex.GetType().Name}: {ex.Message}");
        }

        messages.Sort(StringComparer.Ordinal);
        return messages;
    }

    /// <summary>A stored rule as the console sends it back on save.</summary>
    private static ValidationRuleRequest ToRequest(ValidationRule rule) => new()
    {
        Type = rule.Type,
        Value = rule.Value,
        SecondaryValue = rule.SecondaryValue,
        ErrorMessage = rule.ErrorMessage,
        IsActive = rule.IsActive,
        EvaluationVersion = rule.EvaluationVersion,
    };

    /// <summary>A repository that answers schema queries from the export, matching each filter as Mongo would.</summary>
    private static IDbRepository RepositoryOver(List<SchemaDefinition> schemas)
    {
        var serializer = BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>();
        List<SchemaDefinition> Matching(FilterDefinition<SchemaDefinition> filter)
        {
            var rendered = filter.Render(new RenderArgs<SchemaDefinition>(serializer, BsonSerializer.SerializerRegistry));
            return schemas.Where(s => BsonFilterMatcher.Matches(s.ToBsonDocument(), rendered)).ToList();
        }

        var repository = new Mock<IDbRepository>();
        repository.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> filter, string _) => Matching(filter).FirstOrDefault());
        repository.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<SortDefinition<SchemaDefinition>?>(), It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> filter, SortDefinition<SchemaDefinition>? _, string _) => Matching(filter));
        return repository.Object;
    }

    private static List<T> Load<T>(string path) =>
        BsonSerializer.Deserialize<BsonArray>(System.IO.File.ReadAllText(path))
            .Select(v => BsonSerializer.Deserialize<T>(v.AsBsonDocument))
            .ToList();

    private static string? FindDumpDir()
    {
        var configured = Environment.GetEnvironmentVariable(DumpDirVariable);
        if (!string.IsNullOrWhiteSpace(configured))
            return Directory.Exists(configured) ? configured : null;

        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = System.IO.Path.Combine(dir.FullName, "db-scripts", "almora", "dg");
            if (Directory.Exists(candidate))
                return candidate;
        }
        return null;
    }
}
