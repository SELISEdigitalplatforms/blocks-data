using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

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

    [Fact]
    public void NullPathsInRow_DeeplyNestedBsonAndList()
    {
        var row = new Dictionary<string, object>
        {
            ["Profile"] = new BsonDocument
            {
                { "Contact", new BsonDocument { { "Email", "e" }, { "Phone", "p" } } },
                { "Tags", new BsonArray { new BsonDocument { { "Val", "t1" }, { "Secret", "s" } } } }
            },
            ["History"] = new List<object>
            {
                new BsonDocument { { "Note", "n" }, { "Secret", "z" } },
                new Dictionary<string, object> { ["Note"] = "d" }
            }
        };
        var toNull = new HashSet<string> { "Profile.Contact.Phone", "Profile.Tags.Secret", "History.Secret" };
        QueryClsRowMaskingHelper.NullPathsInRow(row, toNull, "");

        var profile = (BsonDocument)row["Profile"];
        profile["Contact"].AsBsonDocument.Contains("Phone").Should().BeFalse();
        profile["Contact"].AsBsonDocument["Email"].AsString.Should().Be("e");
        profile["Tags"].AsBsonArray[0].AsBsonDocument.Contains("Secret").Should().BeFalse();
        ((BsonDocument)((List<object>)row["History"])[0]).Contains("Secret").Should().BeFalse();
    }

    [Fact]
    public void NullPathsInRow_ListElementDirectlyNulled()
    {
        var row = new Dictionary<string, object>
        {
            ["Items"] = new List<object>
            {
                new Dictionary<string, object> { ["A"] = "1" },
                new Dictionary<string, object> { ["A"] = "2" }
            }
        };
        QueryClsRowMaskingHelper.NullPathsInRow(row, new HashSet<string> { "Items.0" }, "");
        ((List<object>)row["Items"])[0].Should().BeNull();
    }

    [Fact]
    public void NullDeniedFieldsByPath_DeeplyNestedBsonAndList()
    {
        var row = new Dictionary<string, object>
        {
            ["Profile"] = new BsonDocument
            {
                { "Public", "ok" },
                { "Nested", new BsonDocument { { "Salary", 10 }, { "Title", "t" } } },
                { "Rows", new BsonArray { new BsonDocument { { "Salary", 1 }, { "Title", "x" } } } }
            },
            ["History"] = new List<object>
            {
                new BsonDocument { { "Salary", 9 }, { "Title", "h" } }
            }
        };
        var allowed = new HashSet<string> { "Profile.Public", "Profile.Nested.Title", "Profile.Rows.Title", "History.Title" };
        var protectedByCls = new HashSet<string> { "Profile.Nested.Salary", "Profile.Rows.Salary", "History.Salary" };
        QueryClsRowMaskingHelper.NullDeniedFieldsByPath(row, allowed, protectedByCls, "");

        var profile = (BsonDocument)row["Profile"];
        profile["Nested"].AsBsonDocument.Contains("Salary").Should().BeFalse();
        profile["Nested"].AsBsonDocument["Title"].AsString.Should().Be("t");
        profile["Rows"].AsBsonArray[0].AsBsonDocument.Contains("Salary").Should().BeFalse();
        ((BsonDocument)((List<object>)row["History"])[0]).Contains("Salary").Should().BeFalse();
    }

    [Fact]
    public void RemoveFieldByPath_HandlesDictionaryNestingAndDirectBsonLeaf()
    {
        var row = new Dictionary<string, object>
        {
            ["A"] = new Dictionary<string, object> { ["B"] = "keep", ["C"] = "drop" },
            ["Doc"] = new BsonDocument { { "Leaf", "x" }, { "Keep", "y" } }
        };
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "A.C");
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "Doc.Leaf");

        ((Dictionary<string, object>)row["A"]).ContainsKey("C").Should().BeFalse();
        ((Dictionary<string, object>)row["A"]).ContainsKey("B").Should().BeTrue();
        ((BsonDocument)row["Doc"]).Contains("Leaf").Should().BeFalse();
        ((BsonDocument)row["Doc"]).Contains("Keep").Should().BeTrue();
    }

    [Fact]
    public void RemoveFieldByPath_HandlesDeepBsonRecursion()
    {
        var row = new Dictionary<string, object>
        {
            ["Root"] = new BsonDocument("A", new BsonDocument("B", new BsonDocument("C", "leaf")))
        };
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "Root.A.B.C");
        ((BsonDocument)row["Root"])["A"].AsBsonDocument["B"].AsBsonDocument.Contains("C").Should().BeFalse();
    }

    [Fact]
    public void RemoveFieldsByPaths_RemovesMultiple()
    {
        var row = new Dictionary<string, object>
        {
            ["X"] = "1",
            ["Y"] = "2",
            ["Z"] = "3"
        };
        QueryClsRowMaskingHelper.RemoveFieldsByPaths(row, new HashSet<string> { "X", "Z" });
        row.ContainsKey("X").Should().BeFalse();
        row.ContainsKey("Z").Should().BeFalse();
        row.ContainsKey("Y").Should().BeTrue();
    }

    [Fact]
    public void ComputeAllowedFieldNamesForRow_CustomPathNotCoveredByCls_Excluded()
    {
        var schema = Schema(fields: new()
        {
            Field("Public1", "String"),
            Field("Custom1", "String", read: SchemaAccessLevel.Custom)
        });
        var row = new Dictionary<string, object> { ["Public1"] = "a", ["Custom1"] = "b" };
        var protectedByCls = new HashSet<string> { "Other" };

        var allowed = QueryClsRowMaskingHelper.ComputeAllowedFieldNamesForRow(
            row, schema, new List<DataAccessPolicy>(), protectedByCls, (_, _) => false);

        allowed.Should().NotContain("Custom1");
        allowed.Should().Contain("Public1");
    }
}
