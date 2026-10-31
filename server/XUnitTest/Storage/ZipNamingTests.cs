using FluentAssertions;
using Storage.DomainService.Storage.ZipDownload;

namespace XUnitTest.Storage;

public class ZipNamingTests
{
    [Theory]
    [InlineData("report.pdf", "report.pdf")]
    [InlineData("a/b\\c.txt", "a_b_c.txt")]
    [InlineData("..", "unnamed")]
    [InlineData("...", "unnamed")]
    [InlineData("  ", "unnamed")]
    [InlineData(null, "unnamed")]
    [InlineData("q:1?.txt", "q_1_.txt")]
    [InlineData("line\nbreak.txt", "line_break.txt")]
    [InlineData("tab\tbed.txt", "tab_bed.txt")]
    [InlineData("bell\u0007\u007F.txt", "bell__.txt")]
    public void SanitizeSegment_makes_one_safe_segment(string? input, string expected) =>
        ZipNaming.SanitizeSegment(input).Should().Be(expected);

    [Fact]
    public void AddFile_suffixes_case_insensitive_clashes_before_the_extension()
    {
        var b = new ZipPathBuilder();
        b.AddFile("", "report.pdf").Should().Be("report.pdf");
        b.AddFile("", "Report.pdf").Should().Be("Report (1).pdf");
        b.AddFile("", "report.pdf").Should().Be("report (2).pdf");
        b.AddFile("docs", "report.pdf").Should().Be("docs/report.pdf");
    }

    [Fact]
    public void Folders_and_files_share_one_namespace_per_parent()
    {
        var b = new ZipPathBuilder();
        b.AddFolder("", "data").Should().Be("data");
        b.AddFile("", "data").Should().Be("data (1)");
    }

    [Fact]
    public void BuildZipName_rules()
    {
        var now = new DateTime(2026, 11, 1, 9, 5, 0, DateTimeKind.Utc);
        ZipNaming.BuildZipName(null, "Project-Docs", now).Should().Be("Project-Docs.zip");
        ZipNaming.BuildZipName(null, null, now).Should().Be("download-20261101-0905.zip");
        ZipNaming.BuildZipName("my files", "Project-Docs", now).Should().Be("my files.zip");
        ZipNaming.BuildZipName("x.zip", null, now).Should().Be("x.zip");
        ZipNaming.BuildZipName("a/../b", null, now).Should().Be("a_.._b.zip");
    }
}
