using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Gateway;
using FluentAssertions;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// Which fields a caller may supply on a write. Everything the gateway stamps itself (audit and
/// tenant fields of the base entity) is off limits; a handful of base fields stay writable.
/// </summary>
public class WritableFieldsTests
{
    [Theory]
    [InlineData("Title", WriteOperation.Insert, true)]
    [InlineData("ItemId", WriteOperation.Insert, true)]
    [InlineData("ItemId", WriteOperation.Update, false)]
    [InlineData("CreatedBy", WriteOperation.Insert, false)]
    [InlineData("LastUpdatedBy", WriteOperation.Update, false)]
    [InlineData("IsDeleted", WriteOperation.Insert, false)]
    // TenantId is not a base-entity property, so it is an ordinary schema field.
    [InlineData("TenantId", WriteOperation.Update, true)]
    [InlineData("Tags", WriteOperation.Update, true)]
    [InlineData("Language", WriteOperation.Insert, true)]
    [InlineData("OrganizationId", WriteOperation.Update, true)]
    public void IsWritable_FollowsTheRule(string fieldName, WriteOperation operation, bool expected)
        => WritableFields.IsWritable(fieldName, operation).Should().Be(expected);

    [Fact]
    public void EveryBaseEntityProperty_IsCovered()
    {
        string[] allowedOnInsert =
        [
            nameof(GraphQlBaseEntity.OrganizationId),
            nameof(GraphQlBaseEntity.Tags),
            nameof(GraphQlBaseEntity.Language),
            nameof(GraphQlBaseEntity.ItemId)
        ];

        var baseProperties = typeof(GraphQlBaseEntity).GetProperties().Select(p => p.Name).ToList();

        baseProperties.Should().Contain(allowedOnInsert);
        foreach (var property in baseProperties.Except(allowedOnInsert))
        {
            WritableFields.IsWritable(property, WriteOperation.Insert)
                .Should().BeFalse($"{property} is stamped by the gateway");
        }

        foreach (var property in allowedOnInsert)
        {
            WritableFields.IsWritable(property, WriteOperation.Insert)
                .Should().BeTrue($"{property} is a writable base field on insert");
        }
    }
}
