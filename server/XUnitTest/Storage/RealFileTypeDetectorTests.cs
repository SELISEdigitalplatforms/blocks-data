using FluentAssertions;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

public class RealFileTypeDetectorTests
{
    [Fact]
    public void MatchesDeclaredExtension_PdfBytesWithPdfExtension_Matches()
    {
        var bytes = "%PDF-1.4"u8.ToArray();

        RealFileTypeDetector.MatchesDeclaredExtension(".pdf", bytes).Should().BeTrue();
    }

    [Fact]
    public void MatchesDeclaredExtension_ExecutableBytesWithPdfExtension_DoesNotMatch()
    {
        var bytes = "MZ-executable-header"u8.ToArray();

        RealFileTypeDetector.MatchesDeclaredExtension(".pdf", bytes).Should().BeFalse();
    }

    [Theory]
    [InlineData(".png", new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })]
    [InlineData(".jpg", new byte[] { 0xFF, 0xD8, 0xFF, 0x00 })]
    [InlineData(".gif", new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61 })]
    [InlineData(".docx", new byte[] { 0x50, 0x4B, 0x03, 0x04 })]
    public void MatchesDeclaredExtension_KnownSignatureForItsOwnExtension_Matches(string extension, byte[] bytes)
    {
        RealFileTypeDetector.MatchesDeclaredExtension(extension, bytes).Should().BeTrue();
    }

    [Fact]
    public void MatchesDeclaredExtension_UnrecognizedExtension_IsNotRejectedByThisLightweightCheck()
    {
        // Phase 3 owns a strong, comprehensive allowlist; Phase 1 only catches the formats it knows.
        RealFileTypeDetector.MatchesDeclaredExtension(".xyz", new byte[] { 0x00, 0x01, 0x02 }).Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void MatchesDeclaredExtension_MissingExtension_IsNotRejected(string? extension)
    {
        RealFileTypeDetector.MatchesDeclaredExtension(extension, new byte[] { 0x00 }).Should().BeTrue();
    }

    [Fact]
    public void MatchesDeclaredExtension_TooFewBytesForTheSignature_DoesNotMatch()
    {
        RealFileTypeDetector.MatchesDeclaredExtension(".png", new byte[] { 0x89, 0x50 }).Should().BeFalse();
    }
}
