using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class OrderToMongoSortConverterTests
{
    private static SchemaDefinitionExtended PersonSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Age", "Int"),
        Field("ItemId", "ID")
    });

    [Fact]
    public void Convert_Null_ReturnsNull()
    {
        OrderToMongoSortConverter.Convert(null, PersonSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_EmptyList_ReturnsNull()
    {
        OrderToMongoSortConverter.Convert(new List<object>(), PersonSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_AscendingDefault()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Name" }
        };
        var result = OrderToMongoSortConverter.Convert(order, PersonSchema());
        result!["Name"].AsInt32.Should().Be(1);
    }

    [Fact]
    public void Convert_Descending()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Age", ["direction"] = "DESC" }
        };
        var result = OrderToMongoSortConverter.Convert(order, PersonSchema());
        result!["Age"].AsInt32.Should().Be(-1);
    }

    [Fact]
    public void Convert_ItemId_MapsToUnderscoreId()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "ItemId", ["direction"] = "ASC" }
        };
        var result = OrderToMongoSortConverter.Convert(order, PersonSchema());
        result!.Contains("_id").Should().BeTrue();
    }

    [Fact]
    public void Convert_MultipleFields()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Name", ["direction"] = "ASC" },
            new Dictionary<string, object?> { ["field"] = "Age", ["direction"] = "DESC" }
        };
        var result = OrderToMongoSortConverter.Convert(order, PersonSchema());
        result!.ElementCount.Should().Be(2);
    }

    [Fact]
    public void Convert_UnknownField_Throws()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Unknown" }
        };
        var act = () => OrderToMongoSortConverter.Convert(order, PersonSchema());
        act.Should().Throw<ArgumentException>().WithMessage("*not defined on the schema*");
    }

    [Fact]
    public void Convert_DollarPrefixedField_Throws()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "$x" }
        };
        var act = () => OrderToMongoSortConverter.Convert(order, PersonSchema());
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Convert_EntryMissingField_Skipped()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["direction"] = "ASC" }
        };
        OrderToMongoSortConverter.Convert(order, PersonSchema()).Should().BeNull();
    }

    [Theory]
    [InlineData("Name", null, 1)]
    [InlineData("Age", "DESC", -1)]
    [InlineData("Age", "desc", -1)]
    [InlineData("ItemId", "ASC", 1)]
    public void OrderConverter_OrderItemOverload_MatchesObjectOverload(string field, string? direction, int expected)
    {
        var entry = new Dictionary<string, object?> { ["field"] = field };
        if (direction is not null) entry["direction"] = direction;
        var order = new List<object> { entry };

        var viaObject = OrderToMongoSortConverter.Convert(order, PersonSchema());
        var viaItems = OrderToMongoSortConverter.Convert(
            new List<OrderItem> { new(field, direction?.ToUpperInvariant() == "DESC" ? SortDirection.DESC : SortDirection.ASC) },
            PersonSchema());

        Assert.Equal(viaObject, viaItems);
        viaItems!.GetValue(0).AsInt32.Should().Be(expected);
    }

    [Theory]
    [InlineData("Unknown", "*not defined on the schema*")]
    [InlineData("$x", "*Invalid or disallowed sort field*")]
    public void OrderConverter_OrderItemOverload_RejectsBadFieldsLikeTheObjectOverload(string field, string message)
    {
        var order = new List<object> { new Dictionary<string, object?> { ["field"] = field } };

        var viaObject = () => OrderToMongoSortConverter.Convert(order, PersonSchema());
        var viaItems = () => OrderToMongoSortConverter.Convert(new List<OrderItem> { new(field, SortDirection.ASC) }, PersonSchema());

        var expected = viaObject.Should().Throw<ArgumentException>().WithMessage(message).Which.Message;
        viaItems.Should().Throw<ArgumentException>().WithMessage(expected);
    }

    [Fact]
    public void OrderConverter_OrderItemOverload_NullOrEmpty_ReturnsNull()
    {
        OrderToMongoSortConverter.Convert((IReadOnlyList<OrderItem>?)null, PersonSchema()).Should().BeNull();
        OrderToMongoSortConverter.Convert(new List<OrderItem>(), PersonSchema()).Should().BeNull();
    }
}
