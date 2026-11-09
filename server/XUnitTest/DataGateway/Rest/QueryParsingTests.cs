using DataGateway.DomainService.Models;
using DataGateway.DomainService.Gateway;
using DataGateway.Rest;
using DataGateway.Rest.Parsing;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using static XUnitTest.DataGateway.Rest.RestTestEntity;

namespace XUnitTest.DataGateway.Rest;

public class QueryParsingTests
{
    private static readonly RestLimits Limits = new();

    private static IQueryCollection Query(string queryString) => new QueryCollection(QueryHelpers.ParseQuery(queryString));

    private static RestQueryOptions FromQuery(string queryString) => QueryStringParser.Parse(Query(queryString), Order(), Limits);

    private static RestQueryOptions FromBody(string json) => QueryBodyParser.Parse(Json(json), Order(), Limits);

    // ---- order ----

    [Fact]
    public void Order_QueryAndBodyForms_ProduceSameItems()
    {
        var fromQuery = FromQuery("?order=Name:ASC,CreatedDate:desc,Age");
        var fromBody = FromBody("""
            { "order": [
                { "field": "Name", "direction": "ASC" },
                { "field": "CreatedDate", "direction": "desc" },
                { "field": "Age" } ] }
            """);

        var expected = new[]
        {
            new OrderItem("Name", SortDirection.ASC),
            new OrderItem("CreatedDate", SortDirection.DESC),
            new OrderItem("Age", SortDirection.ASC)
        };
        fromQuery.Order.Should().Equal(expected);
        fromBody.Order.Should().Equal(expected);
    }

    [Fact]
    public void Order_DefaultsToAsc()
    {
        FromQuery("?order=Name").Order.Should().Equal(new OrderItem("Name", SortDirection.ASC));
        FromBody("""{ "order": [{ "field": "Name" }] }""").Order.Should().Equal(new OrderItem("Name", SortDirection.ASC));
        FromBody("""{ "order": [{ "field": "Name", "direction": null }] }""").Order.Should().Equal(new OrderItem("Name", SortDirection.ASC));
    }

    [Fact]
    public void Order_Missing_IsNull()
    {
        FromQuery("").Order.Should().BeNull();
        FromQuery("?order=").Order.Should().BeNull();
        FromBody("{}").Order.Should().BeNull();
        FromBody("""{ "order": [] }""").Order.Should().BeNull();
    }

    [Fact]
    public void Order_UnknownField_Rejected()
    {
        FluentActions.Invoking(() => FromQuery("?order=Nope:ASC"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Nope'.");
        FluentActions.Invoking(() => FromBody("""{ "order": [{ "field": "Nope" }] }"""))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Nope'.");
        // A nested path is not sortable: the sort converter takes top-level fields only.
        FluentActions.Invoking(() => FromQuery("?order=Ship.City"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Ship.City'.");
    }

    [Fact]
    public void Order_OnDtoField_Rejected()
    {
        // Sorting on a whole DTO would order by every field inside it, past the column rules on those fields.
        const string message = "Field 'Ship' cannot be used to sort; sort by one of its fields instead.";
        var fromQuery = FluentActions.Invoking(() => FromQuery("?order=Ship:ASC"))
            .Should().Throw<RestRequestException>().WithMessage(message).Which;
        var fromBody = FluentActions.Invoking(() => FromBody("""{ "order": [{ "field": "Billing", "direction": "DESC" }] }"""))
            .Should().Throw<RestRequestException>()
            .WithMessage("Field 'Billing' cannot be used to sort; sort by one of its fields instead.").Which;

        fromQuery.Errors.Should().ContainSingle().Which.Field.Should().Be("Ship");
        fromBody.Errors.Should().ContainSingle().Which.Field.Should().Be("Billing");
        // A scalar of any kind, GeoJSON included, still sorts.
        FromQuery("?order=Location").Order.Should().Equal(new OrderItem("Location", SortDirection.ASC));
    }

    [Fact]
    public void Order_WrongCaseField_SuggestsSchemaName()
    {
        var ex = FluentActions.Invoking(() => FromQuery("?order=name"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'name'. Did you mean 'Name'?").Which;
        ex.Errors.Should().ContainSingle().Which.Field.Should().Be("name");
    }

    [Fact]
    public void Order_InvalidDirection_Rejected()
    {
        FluentActions.Invoking(() => FromQuery("?order=Name:UP")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => FromBody("""{ "order": [{ "field": "Name", "direction": "UP" }] }"""))
            .Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => FromQuery("?order=Name:ASC:DESC")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => FromQuery("?order=Name,,Age")).Should().Throw<RestRequestException>();
    }

    // ---- select ----

    [Fact]
    public void Select_NestedPath_Accepted()
    {
        // Ship carries its DTO fields inline; Billing's are found through EntityModel.Dtos.
        var expected = new[] { "Name", "Ship.Street", "Billing.City", "Ship" };
        FromQuery("?select=Name,Ship.Street,Billing.City,Ship").Select.Should().Equal(expected);
        FromBody("""{ "select": ["Name", "Ship.Street", "Billing.City", "Ship"] }""").Select.Should().Equal(expected);
    }

    [Fact]
    public void Select_UnknownPath_Rejected()
    {
        FluentActions.Invoking(() => FromQuery("?select=Ship.Nope"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Ship.Nope'.");
        FluentActions.Invoking(() => FromBody("""{ "select": ["Name.Inner"] }"""))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Name.Inner'.");
        FluentActions.Invoking(() => FromQuery("?select=Billing.nope"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Billing.nope'.");
        FluentActions.Invoking(() => FromQuery("?select=ship.city"))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'ship.city'. Did you mean 'Ship.City'?");
    }

    // ---- paging ----

    [Fact]
    public void Paging_Defaults()
    {
        var options = FromQuery("");
        options.PageNo.Should().Be(1);
        options.PageSize.Should().Be(10);
        options.IncludeTotalCount.Should().BeFalse();
        options.Where.Should().BeNull();

        var body = FromBody("{}");
        body.PageNo.Should().Be(1);
        body.PageSize.Should().Be(10);
    }

    [Theory]
    [InlineData("?pageNo=0")]
    [InlineData("?pageNo=-1")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=1001")]
    [InlineData("?pageSize=abc")]
    [InlineData("?pageNo=1.5")]
    public void Paging_OutOfRange_RejectedNotClamped(string queryString)
    {
        FluentActions.Invoking(() => FromQuery(queryString)).Should().Throw<RestRequestException>();
    }

    [Theory]
    [InlineData("""{ "paging": { "pageNo": 0 } }""")]
    [InlineData("""{ "paging": { "pageSize": 1001 } }""")]
    [InlineData("""{ "paging": { "pageSize": 0 } }""")]
    [InlineData("""{ "paging": { "pageSize": 2.5 } }""")]
    [InlineData("""{ "paging": { "pageSize": "20" } }""")]
    [InlineData("""{ "paging": { "page": 2 } }""")]
    public void Paging_OutOfRange_RejectedNotClamped_Body(string json)
    {
        FluentActions.Invoking(() => FromBody(json)).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void Paging_InRange_Accepted()
    {
        var query = FromQuery("?pageNo=3&pageSize=1000&includeTotalCount=true");
        query.PageNo.Should().Be(3);
        query.PageSize.Should().Be(1000);
        query.IncludeTotalCount.Should().BeTrue();

        var body = FromBody("""{ "paging": { "pageNo": 2, "pageSize": 20 }, "includeTotalCount": true }""");
        body.PageNo.Should().Be(2);
        body.PageSize.Should().Be(20);
        body.IncludeTotalCount.Should().BeTrue();
    }

    [Fact]
    public void IncludeTotalCount_NotABoolean_Rejected()
    {
        FluentActions.Invoking(() => FromQuery("?includeTotalCount=yes")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => FromBody("""{ "includeTotalCount": "true" }""")).Should().Throw<RestRequestException>();
    }

    // ---- query string strictness (Review Focus 4) ----

    [Fact]
    public void QueryString_RepeatedParameter_Rejected()
    {
        FluentActions.Invoking(() => FromQuery("?order=Name&order=Age"))
            .Should().Throw<RestRequestException>().WithMessage("Parameter 'order' was given more than once.");
        FluentActions.Invoking(() => FromQuery("?select=Name&select="))
            .Should().Throw<RestRequestException>().WithMessage("Parameter 'select' was given more than once.");
    }

    [Fact]
    public void QueryString_EmptySelect_MeansAll()
    {
        FromQuery("?select=").Select.Should().BeEmpty();
        FromQuery("?select").Select.Should().BeEmpty();
        FromQuery("").Select.Should().BeEmpty();
        FromBody("""{ "select": [] }""").Select.Should().BeEmpty();
        FromBody("{}").Select.Should().BeEmpty();
    }

    [Theory]
    [InlineData("?where=x", "where")]
    [InlineData("?filter=x", "filter")]
    [InlineData("?PageNo=2", "PageNo")]
    public void QueryString_UnknownParameter_Rejected(string queryString, string name)
    {
        FluentActions.Invoking(() => FromQuery(queryString))
            .Should().Throw<RestRequestException>().WithMessage($"Unknown parameter '{name}'.");
    }

    [Fact]
    public void ParseSelectOnly_AllowsOnlySelect()
    {
        QueryStringParser.ParseSelectOnly(Query("?select=Name,Ship.City"), Order()).Should().Equal("Name", "Ship.City");
        QueryStringParser.ParseSelectOnly(Query(""), Order()).Should().BeEmpty();
        FluentActions.Invoking(() => QueryStringParser.ParseSelectOnly(Query("?pageNo=1"), Order()))
            .Should().Throw<RestRequestException>().WithMessage("Unknown parameter 'pageNo'.");
        FluentActions.Invoking(() => QueryStringParser.ParseSelectOnly(Query("?select=Name&select=Age"), Order()))
            .Should().Throw<RestRequestException>().WithMessage("Parameter 'select' was given more than once.");
        FluentActions.Invoking(() => QueryStringParser.ParseSelectOnly(Query("?select=Nope"), Order()))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Nope'.");
    }

    // ---- body ----

    [Fact]
    public void Body_ReadsWhere()
    {
        var options = FromBody("""{ "where": { "Name": { "eq": "x" } } }""");
        options.Where.Should().NotBeNull();
        options.Where!.Root.Should().ContainKey("Name");

        FromBody("""{ "where": null }""").Where.Should().BeNull();
    }

    [Theory]
    [InlineData("""{ "filter": "{}" }""")]
    [InlineData("""{ "Where": {} }""")]
    [InlineData("""{ "select": "Name" }""")]
    [InlineData("""{ "select": [1] }""")]
    [InlineData("""{ "order": { "field": "Name" } }""")]
    [InlineData("""{ "order": [{ "field": "Name", "dir": "ASC" }] }""")]
    [InlineData("""{ "order": [{ "direction": "ASC" }] }""")]
    [InlineData("""{ "select": ["Name"], "select": ["Age"] }""")]
    [InlineData("""[]""")]
    public void Body_InvalidShape_Rejected(string json)
    {
        FluentActions.Invoking(() => FromBody(json)).Should().Throw<RestRequestException>();
    }

    [Theory]
    [InlineData("""{ "\ud800": 1 }""")]
    [InlineData("""{ "order": [{ "field": "\ud800" }] }""")]
    [InlineData("""{ "order": [{ "field": "Name", "direction": "\ud800" }] }""")]
    [InlineData("""{ "select": ["\ud800"] }""")]
    [InlineData("""{ "paging": { "\ud800": 1 } }""")]
    public void Body_LoneSurrogate_IsFieldErrorNot500(string json)
    {
        FluentActions.Invoking(() => FromBody(json)).Should().Throw<RestRequestException>()
            .Which.Message.Should().EndWith("contains an invalid string.");
    }
}
