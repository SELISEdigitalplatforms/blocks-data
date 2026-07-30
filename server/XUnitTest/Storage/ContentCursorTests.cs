using FluentAssertions;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;

namespace XUnitTest.Storage;

public class ContentCursorTests
{
    [Fact]
    public void A_cursor_round_trips_through_its_encoding()
    {
        var cursor = new ContentCursor { Type = StructureType.Directory, Name = "Reports", ItemId = "dir-1" };

        var decoded = ContentCursor.Decode(cursor.Encode());

        decoded.Should().NotBeNull();
        decoded!.Type.Should().Be(StructureType.Directory);
        decoded.Name.Should().Be("Reports");
        decoded.ItemId.Should().Be("dir-1");
    }

    [Theory]
    [InlineData("name with spaces")]
    [InlineData("name|with|pipes")]
    [InlineData("name/with/slashes")]
    [InlineData("naïve café")]
    [InlineData("")]
    public void A_name_containing_awkward_characters_survives_the_round_trip(string name)
    {
        var cursor = new ContentCursor { Type = StructureType.File, Name = name, ItemId = "file-1" };

        ContentCursor.Decode(cursor.Encode())!.Name.Should().Be(name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not base64 at all!")]
    [InlineData("dHdvIHBhcnRz")]
    public void A_missing_or_malformed_cursor_decodes_to_null_rather_than_throwing(string? encoded)
    {
        // A stale bookmark should fall back to the first page, not fail the request.
        ContentCursor.Decode(encoded).Should().BeNull();
    }

    [Fact]
    public void A_cursor_naming_an_unknown_type_decodes_to_null()
    {
        var raw = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("99nameid"));

        ContentCursor.Decode(raw).Should().BeNull();
    }

    [Fact]
    public void Folders_sort_ahead_of_files()
    {
        // Even when the file's name would otherwise come first.
        ContentCursor.Compare(StructureType.Directory, "zzz", "a", StructureType.File, "aaa", "b")
            .Should().BeNegative();
    }

    [Fact]
    public void Within_one_type_the_order_is_by_name_then_id()
    {
        ContentCursor.Compare(StructureType.File, "alpha", "b", StructureType.File, "beta", "a")
            .Should().BeNegative();

        ContentCursor.Compare(StructureType.File, "same", "a", StructureType.File, "same", "b")
            .Should().BeNegative();

        ContentCursor.Compare(StructureType.File, "same", "a", StructureType.File, "same", "a")
            .Should().Be(0);
    }

    [Fact]
    public void Name_ordering_is_ordinal_so_it_matches_the_database_sort()
    {
        // Ordinal puts uppercase before lowercase. A case-insensitive comparison here
        // would disagree with the query's range scan and drop rows at page boundaries.
        ContentCursor.Compare(StructureType.File, "Zebra", "a", StructureType.File, "apple", "b")
            .Should().BeNegative();
    }

    [Fact]
    public void IsBefore_reports_only_items_that_sort_strictly_after_the_position()
    {
        var position = new ContentCursor { Type = StructureType.File, Name = "m", ItemId = "id-5" };

        position.IsBefore(StructureType.File, "n", "id-1").Should().BeTrue();
        position.IsBefore(StructureType.File, "m", "id-6").Should().BeTrue();
        position.IsBefore(StructureType.File, "m", "id-5").Should().BeFalse("the boundary item itself was already returned");
        position.IsBefore(StructureType.File, "l", "id-9").Should().BeFalse();
        position.IsBefore(StructureType.Directory, "z", "id-9").Should().BeFalse("folders sort ahead of files");
    }
}
