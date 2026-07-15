using DataGateway.DomainService.Helpers;
using FluentAssertions;
using MongoDB.Bson;

namespace XUnitTest.DataGateway;

public class QueryClsRowMaskingBoostTests
{
    [Fact]
    public void NullPathsInRow_HandlesBsonDocumentAndArray()
    {
        var row = new Dictionary<string, object>
        {
            ["Doc"] = new BsonDocument { { "Secret", "s" }, { "Ok", "o" } },
            ["Arr"] = new BsonArray { new BsonDocument("Secret", "a1"), new BsonDocument("Secret", "a2") }
        };
        QueryClsRowMaskingHelper.NullPathsInRow(row, new HashSet<string> { "Doc.Secret", "Arr.Secret" }, "");

        ((BsonDocument)row["Doc"]).Contains("Secret").Should().BeFalse();
        ((BsonDocument)row["Doc"])["Ok"].AsString.Should().Be("o");
    }

    [Fact]
    public void NullPathsInRow_HandlesListOfDictionaries()
    {
        var row = new Dictionary<string, object>
        {
            ["Items"] = new List<object>
            {
                new Dictionary<string, object> { ["Secret"] = "x", ["Keep"] = "y" }
            }
        };
        QueryClsRowMaskingHelper.NullPathsInRow(row, new HashSet<string> { "Items.Secret" }, "");
        var first = (Dictionary<string, object>)((List<object>)row["Items"])[0];
        first["Secret"].Should().BeNull();
        first["Keep"].Should().Be("y");
    }

    [Fact]
    public void NullDeniedFieldsByPath_HandlesBsonDocumentAndArray()
    {
        var row = new Dictionary<string, object>
        {
            ["Doc"] = new BsonDocument { { "Salary", 100 }, { "Name", "n" } },
            ["Arr"] = new BsonArray { new BsonDocument { { "Salary", 1 } } }
        };
        var allowed = new HashSet<string> { "Doc.Name" };
        var protectedByCls = new HashSet<string> { "Doc.Salary", "Arr.Salary" };
        QueryClsRowMaskingHelper.NullDeniedFieldsByPath(row, allowed, protectedByCls, "");

        ((BsonDocument)row["Doc"]).Contains("Salary").Should().BeFalse();
        ((BsonDocument)row["Doc"])["Name"].AsString.Should().Be("n");
    }

    [Fact]
    public void NullDeniedFieldsByPath_HandlesListOfDictionaries()
    {
        var row = new Dictionary<string, object>
        {
            ["Items"] = new List<object>
            {
                new Dictionary<string, object> { ["Salary"] = 5, ["Name"] = "n" }
            }
        };
        var allowed = new HashSet<string> { "Items.Name" };
        var protectedByCls = new HashSet<string> { "Items.Salary" };
        QueryClsRowMaskingHelper.NullDeniedFieldsByPath(row, allowed, protectedByCls, "");

        var first = (Dictionary<string, object>)((List<object>)row["Items"])[0];
        first["Salary"].Should().BeNull();
    }

    [Fact]
    public void RemoveFieldByPath_HandlesBsonNested()
    {
        var row = new Dictionary<string, object>
        {
            ["Doc"] = new BsonDocument("Inner", new BsonDocument("Leaf", "x"))
        };
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "Doc.Inner.Leaf");
        ((BsonDocument)((BsonDocument)row["Doc"])["Inner"].AsBsonDocument).Contains("Leaf").Should().BeFalse();
    }
}
