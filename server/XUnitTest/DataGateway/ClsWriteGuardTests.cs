using DataGateway.DomainService.Helpers;
using FluentAssertions;
using MongoDB.Bson;

namespace XUnitTest.DataGateway;

public class ClsWriteGuardTests
{
    private static readonly BsonDocument Stored = new()
    {
        { "_id", "r1" },
        { "Age", 30L },
        { "Contact", new BsonDocument { { "Email", "a@x.io" }, { "City", "Dhaka" } } },
        { "Tags", new BsonArray { "a", "b" } },
        { "Note", BsonNull.Value },
    };

    [Fact]
    public void ChangedPaths_IgnoresValuesSentBackAsTheyAre()
    {
        var input = new Dictionary<string, object?>
        {
            ["Age"] = 30,   // int sent, long stored
            ["Contact"] = new Dictionary<string, object?> { ["City"] = "Dhaka", ["Email"] = "a@x.io" },   // other order
            ["Tags"] = new List<object?> { "a", "b" },
            ["Note"] = null,   // null and stored null are the same
        };

        ClsWriteGuard.ChangedPaths(input, Stored).Should().BeEmpty();
    }

    [Fact]
    public void ChangedPaths_ReportsWhatDiffers_DownToTheNestedProperty()
    {
        var input = new Dictionary<string, object?>
        {
            ["Age"] = 31,
            ["Contact"] = new Dictionary<string, object?> { ["Email"] = "b@x.io", ["City"] = "Dhaka" },
            ["Tags"] = new List<object?> { "a" },
            ["Missing"] = "new",
        };

        ClsWriteGuard.ChangedPaths(input, Stored).Should().BeEquivalentTo("Age", "Contact", "Contact.Email", "Tags", "Missing");
    }
}
