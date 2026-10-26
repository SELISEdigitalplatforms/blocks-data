using System.Text.Json;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using HotChocolate;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// The schema description (validation and access rules plan, section 7, phase 5), and schema renames carrying Must not
/// exist in targets (section 5). A schema without a description reads and exports exactly as before (G13).
/// </summary>
[Collection("ContextSerial")]
public class SchemaDescriptionTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly Mock<ISchemaIndexService> _schemaIndexService = new();
    private readonly SchemaDefinitionService _service;
    private SchemaDefinition? _saved;

    public SchemaDescriptionTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, It.IsAny<int>(), It.IsAny<int>(), "")).ReturnsAsync(new List<SchemaDefinition>());
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync((SchemaDefinition s, string _) => _saved = s);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).Callback((SchemaDefinition s, string _) => _saved = s).ReturnsAsync(new ActionResponse { Acknowledged = true });
        var referenceHelper = new SchemaDefinitionReferenceHelper(_repo.Object, _changeLog.Object);
        _service = new SchemaDefinitionService(_repo.Object, _validator.Object, _changeLog.Object, referenceHelper, _schemaIndexService.Object, NullLogger<SchemaDefinitionService>.Instance);
    }

    private void Stored(SchemaDefinition schema) =>
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(schema.ItemId, "")).ReturnsAsync(schema);

    // ── Create / update ──

    [Theory]
    [InlineData("  Orders placed online  ", "Orders placed online")]
    [InlineData("   ", null)]
    [InlineData(null, null)]
    public async Task Create_StoresTheTrimmedDescription_AndNothingWhenEmpty(string? sent, string? stored)
    {
        await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = sent });
        _saved!.Description.Should().Be(stored);
    }

    [Fact]
    public async Task Update_WithoutADescription_KeepsTheStoredOne()
    {
        // A caller that predates descriptions must not wipe one on a rename.
        Stored(new SchemaDefinition { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = "Kept" });
        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity });
        _saved!.Description.Should().Be("Kept");
    }

    [Theory]
    [InlineData("", null)]
    [InlineData(" New text ", "New text")]
    public async Task Update_AnEmptyDescriptionClears_TextReplaces(string sent, string? stored)
    {
        Stored(new SchemaDefinition { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = "Old" });
        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = sent });
        _saved!.Description.Should().Be(stored);
    }

    [Fact]
    public void Validators_AllowAtMost500Characters()
    {
        var create = new CreateSchemaRequestValidator(_repo.Object);
        var update = new UpdateSchemaRequestValidator();
        CreateSchemaRequest Create(int length) => new() { SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = new string('a', length) };
        UpdateSchemaRequest Update(int length) => new() { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = new string('a', length) };

        create.Validate(Create(500)).IsValid.Should().BeTrue();
        create.Validate(Create(501)).Errors.Should().Contain(e => e.ErrorMessage == SchemaDescription.LengthMessage);
        update.Validate(Update(500)).IsValid.Should().BeTrue();
        update.Validate(Update(501)).Errors.Should().Contain(e => e.ErrorMessage == SchemaDescription.LengthMessage);
    }

    // ── Responses, export and import ──

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Response_WithoutADescription_HasNoDescriptionKey()
    {
        // G13. Field descriptions are a different key, inside "fields".
        var json = JsonSerializer.SerializeToElement(new SchemaDefinition { ItemId = "s1", SchemaName = "Order" }.MapToResponse(), Web);
        json.TryGetProperty("description", out _).Should().BeFalse();

        var described = JsonSerializer.SerializeToElement(new SchemaDefinition { ItemId = "s1", SchemaName = "Order", Description = "Orders" }.MapToResponse([], []), Web);
        described.GetProperty("description").GetString().Should().Be("Orders");
    }

    [Fact]
    public void Export_WithoutADescription_HasNoDescriptionKey_AndImportCarriesOne()
    {
        var plain = new SchemaDefinition { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity };
        var described = new SchemaDefinition { ItemId = "s2", SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity, Description = "Bills" };

        var documents = new List<SchemaDefinition> { plain, described }.MapToExportDocuments([], [], new SchemaExportOption());
        var json = JsonSerializer.SerializeToElement(documents);

        json[0].TryGetProperty("Description", out _).Should().BeFalse();
        json[1].GetProperty("Description").GetString().Should().Be("Bills");
        JsonSerializer.Deserialize<List<SchemaExportDocument>>(json)![1].MapToSchemaDefinition().Description.Should().Be("Bills");
    }

    [Fact]
    public void TheGraphQlType_CarriesTheDescription()
    {
        var builder = new GraphqlSchemaBuilder(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object), new Mock<IDbRepository>().Object, NullLogger<GraphqlSchemaBuilder>.Instance);
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                new SchemaDefinition { ItemId = "s1", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = "Orders placed online", Fields = [new FieldDefinition { Name = "Total", Type = "Float" }] },
                new SchemaDefinition { ItemId = "s2", SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity, Fields = [new FieldDefinition { Name = "Total", Type = "Float" }] },
            ],
        };
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("t", source, schemaBuilder);
        var schema = schemaBuilder.Create();

        schema.GetType<ObjectType>("Order").Description.Should().Be("Orders placed online");
        schema.GetType<ObjectType>("Invoice").Description.Should().BeNull();
    }

    // ── Rename carries Must not exist in targets (section 5) ──

    [Fact]
    public async Task Rename_CarriesReferenceAndMustNotExistInTargets()
    {
        Stored(new SchemaDefinition { ItemId = "s1", SchemaName = "Blocklist", CollectionName = "Blocklists", SchemaType = SchemaType.Entity });
        var pointing = new DataValidation
        {
            ItemId = "v1", FieldName = "Email",
            Validations =
            [
                new ValidationRule { Type = ValidationType.Reference, Value = "Blocklist", SecondaryValue = "Email" },
                new ValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" },
                new ValidationRule { Type = ValidationType.NotExistsIn, Value = "Other", SecondaryValue = "Email" },
            ],
        };
        FilterDefinition<DataValidation>? query = null;
        _repo.Setup(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), null, ""))
            .Callback((FilterDefinition<DataValidation> f, SortDefinition<DataValidation>? _, string _) => query ??= f)
            .ReturnsAsync([pointing]);
        _repo.Setup(r => r.UpdateManyAsync(It.IsAny<List<DataValidation>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "s1", SchemaName = "DenyList", CollectionName = "Blocklists", SchemaType = SchemaType.Entity });

        pointing.Validations.Select(r => r.Value).Should().Equal("DenyList", "DenyList", "Other");
        var rendered = query!.Render(new MongoDB.Driver.RenderArgs<DataValidation>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<DataValidation>(), MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry)).ToString();
        rendered.Should().Contain("NotExistsIn");
    }
}
