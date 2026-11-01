using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schema;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// <see cref="SchemaAssembler"/> reads and assembles a tenant's schema without any GraphQL: what a
/// publish validates and what the gateway builds its types from.
/// </summary>
[Collection("Mongo")]
public class SchemaAssemblerTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    public SchemaAssemblerTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        _repository = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private static SchemaDefinition Definition(string id, string name, bool isDeleted = false, bool isSystemEntity = false, bool withFields = true) => new()
    {
        ItemId = id,
        SchemaName = name,
        CollectionName = $"{name}s",
        SchemaType = SchemaType.Entity,
        IsDeleted = isDeleted,
        IsSystemEntity = isSystemEntity,
        Fields = withFields ? [new FieldDefinition { Name = "Name", Type = "String" }] : [],
    };

    [Fact]
    public async Task ReadDraftSourceAsync_ExcludesSystemEntitiesAndDeleted()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
        [
            Definition("sch-order", "Order"),
            Definition("sch-gone", "Gone", isDeleted: true),
            Definition("sch-system", "User", isSystemEntity: true),
            Definition("sch-empty", "Empty", withFields: false),
        ]);
        await _db.GetCollection<DataValidation>("DataValidations").InsertManyAsync(
        [
            new DataValidation { ItemId = "val-live", SchemaId = "sch-order", FieldName = "Name" },
            new DataValidation { ItemId = "val-deleted", SchemaId = "sch-order", FieldName = "Name", IsDeleted = true },
        ]);
        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertManyAsync(
        [
            new DataAccessPolicy { ItemId = "pol-order", SchemaId = "sch-order", PolicyName = "Order policy", PolicyType = PolicyType.RLS },
            new DataAccessPolicy { ItemId = "pol-system", SchemaId = "sch-system", PolicyName = "System policy", PolicyType = PolicyType.RLS },
            new DataAccessPolicy { ItemId = "pol-deleted", SchemaId = "sch-order", PolicyName = "Deleted policy", PolicyType = PolicyType.RLS, IsDeleted = true },
        ]);

        var source = await new SchemaAssembler(_repository).ReadDraftSourceAsync(Tenant);

        source.SchemaDefinitions.Select(s => s.SchemaName).Should().Equal("Order");
        source.DataValidations.Select(v => v.ItemId).Should().Equal("val-live");
        source.DataAccessPolicies.Select(p => p.ItemId).Should().Equal("pol-order");
        source.SystemEntitySchemas.Should().BeEmpty("no rule points at the system entity");
    }

    [Fact]
    public async Task ReadDraftSourceAsync_NoSchemas_ReturnsEmptySource()
    {
        var source = await new SchemaAssembler(_repository).ReadDraftSourceAsync(Tenant);

        source.SchemaDefinitions.Should().BeEmpty();
        source.DataValidations.Should().BeEmpty();
        source.DataAccessPolicies.Should().BeEmpty();
        source.SystemEntitySchemas.Should().BeEmpty();
    }

    [Fact]
    public void Assemble_AttachesFieldValidationAndAccessLevels()
    {
        var order = new SchemaDefinition
        {
            ItemId = "sch-order",
            SchemaName = "Order",
            CollectionName = "Orders",
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = SchemaAccessLevel.Public,
            WriteAccessLevel = SchemaAccessLevel.User,
            EditAccessLevel = SchemaAccessLevel.Custom,
            DeleteAccessLevel = SchemaAccessLevel.Custom,
            Fields =
            [
                new FieldDefinition { Name = "Status", Type = "String", ReadAccessLevel = SchemaAccessLevel.Public },
                new FieldDefinition { Name = "Note", Type = "String" },
            ],
        };
        var validation = new DataValidation { ItemId = "val-status", SchemaId = "sch-order", FieldName = "Status" };

        var assembled = SchemaAssembler.Assemble(new SchemaSource
        {
            SchemaDefinitions = [order],
            DataValidations = [validation],
        });

        var schema = assembled.Should().ContainSingle().Subject;
        schema.SchemaName.Should().Be("Order");
        schema.CollectionName.Should().Be("Orders");
        schema.ReadAccessLevel.Should().Be(SchemaAccessLevel.Public);
        schema.WriteAccessLevel.Should().Be(SchemaAccessLevel.User);
        schema.EditAccessLevel.Should().Be(SchemaAccessLevel.Custom);
        schema.DeleteAccessLevel.Should().Be(SchemaAccessLevel.Custom);
        var status = schema.Fields.Single(f => f.Name == "Status");
        status.ValidationRule.Should().BeSameAs(validation);
        status.ReadAccessLevel.Should().Be(SchemaAccessLevel.Public);
        schema.Fields.Single(f => f.Name == "Note").ValidationRule.Should().BeNull();
    }

    [Fact]
    public void Assemble_NoDefinitions_ReturnsEmptyList()
    {
        SchemaAssembler.Assemble(new SchemaSource()).Should().BeEmpty();
    }
}
