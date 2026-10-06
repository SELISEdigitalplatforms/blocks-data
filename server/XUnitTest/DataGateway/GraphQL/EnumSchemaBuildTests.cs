using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>Builds a real schema containing Enum fields (SPEC #353 H1, H3, H4, C6).</summary>
[Collection("Mongo")]
public class EnumSchemaBuildTests
{
    private readonly DbRepository _repo;

    public EnumSchemaBuildTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private async Task SeedAsync()
    {
        var meta = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "TicketMeta",
            CollectionName = "TicketMetas",
            SchemaType = SchemaType.Dto,
            Fields =
            [
                new FieldDefinition { Name = "label", Type = "String" },
                new FieldDefinition
                {
                    Name = "priority",
                    Type = "Enum",
                    EnumValues = ["Low", "High"]
                },
            ],
        };
        var ticket = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Ticket",
            CollectionName = "Tickets",
            SchemaType = SchemaType.Entity,
            Fields =
            [
                new FieldDefinition { Name = "title", Type = "String", RequiredOn = RequiredOn.Both },
                new FieldDefinition
                {
                    Name = "status",
                    Type = "Enum",
                    EnumValues = ["Active", "Inactive", "Pending"]
                },
                new FieldDefinition
                {
                    Name = "tags",
                    Type = "Enum",
                    IsArray = true,
                    EnumValues = ["Urgent", "Billing", "Bug"]
                },
                new FieldDefinition { Name = "Meta", Type = "TicketMeta" },
            ],
        };
        var order = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Order",
            CollectionName = "Orders",
            SchemaType = SchemaType.Entity,
            Fields =
            [
                new FieldDefinition
                {
                    Name = "status",
                    Type = "Enum",
                    EnumValues = ["Open", "Closed"]
                },
            ],
        };
        await _repo.InsertManyAsync(new List<SchemaDefinition> { meta, ticket, order });
    }

    private async Task<ISchema> BuildSchemaAsync()
    {
        await SeedAsync();
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        var builder = new GraphqlSchemaBuilder(resolver, _repo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        await builder.BuildSchema("", schemaBuilder, CancellationToken.None);
        return schemaBuilder.Create();
    }

    [Fact]
    public async Task Schema_RegistersPerFieldEnumType()
    {
        var schema = await BuildSchemaAsync();
        schema.Types.Should().Contain(t => t.Name == "TicketStatusEnum");
        var ticket = schema.GetType<ObjectType>("Ticket");
        ticket.Fields["status"].Type.NamedType().Name.Should().Be("TicketStatusEnum");
        var enumType = schema.GetType<EnumType>("TicketStatusEnum");
        enumType.Values.Select(v => v.Name).Should().BeEquivalentTo(["Active", "Inactive", "Pending"]);
    }

    [Fact]
    public async Task Schema_TypesArrayEnumAsList()
    {
        var schema = await BuildSchemaAsync();
        var tags = schema.GetType<ObjectType>("Ticket").Fields["tags"];
        tags.Type.IsListType().Should().BeTrue();
        tags.Type.NamedType().Name.Should().Be("TicketTagsEnum");
    }

    [Fact]
    public async Task Schema_SupportsEnumInsideDto()
    {
        var schema = await BuildSchemaAsync();
        schema.GetType<ObjectType>("TicketMeta").Fields["priority"]
            .Type.NamedType().Name.Should().Be("TicketMetaPriorityEnum");
        schema.GetType<InputObjectType>("TicketMetaInput").Fields["priority"]
            .Type.NamedType().Name.Should().Be("TicketMetaPriorityEnum");
        schema.Types.Should().Contain(t => t.Name == "TicketMetaPriorityEnumOperationFilterInput");
    }

    [Fact]
    public async Task Schema_GivesEnumFieldsEqNeqInNinFilters()
    {
        var schema = await BuildSchemaAsync();
        var ticketFilter = schema.GetType<InputObjectType>("TicketFilterInput");
        ticketFilter.Fields["status"].Type.NamedType().Name.Should().Be("TicketStatusEnumOperationFilterInput");
        var op = schema.GetType<InputObjectType>("TicketStatusEnumOperationFilterInput");
        op.Fields.Select(f => f.Name).Should().BeEquivalentTo(["eq", "neq", "in", "nin"]);
        op.Fields["eq"].Type.NamedType().Name.Should().Be("TicketStatusEnum");
    }

    [Fact]
    public async Task Schema_DistinctEnumTypesPerSchema_SameFieldName()
    {
        var schema = await BuildSchemaAsync();
        schema.Types.Should().Contain(t => t.Name == "TicketStatusEnum");
        schema.Types.Should().Contain(t => t.Name == "OrderStatusEnum");
        schema.GetType<EnumType>("TicketStatusEnum").Values.Select(v => v.Name)
            .Should().BeEquivalentTo(["Active", "Inactive", "Pending"]);
        schema.GetType<EnumType>("OrderStatusEnum").Values.Select(v => v.Name)
            .Should().BeEquivalentTo(["Open", "Closed"]);
    }
}
