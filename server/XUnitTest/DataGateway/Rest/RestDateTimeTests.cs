using DataGateway.Rest.Parsing;
using FluentAssertions;

namespace XUnitTest.DataGateway.Rest;

public class RestDateTimeTests
{
    [Theory]
    [InlineData("2024-01-01T10:00:00Z", 2024, 1, 1, 10, 0, 0, 0)]
    [InlineData("2024-01-01T10:00:00+06:00", 2024, 1, 1, 4, 0, 0, 0)]
    [InlineData("2024-01-01T01:00:00+06:00", 2023, 12, 31, 19, 0, 0, 0)]
    [InlineData("2024-01-01T10:00:00.5-01:00", 2024, 1, 1, 11, 0, 0, 500)]
    public void TryParse_IsoWithOffset_GivesUtc(string text, int y, int mo, int d, int h, int mi, int s, int ms)
    {
        RestDateTime.TryParse(text, out var utc).Should().BeTrue();
        utc.Kind.Should().Be(DateTimeKind.Utc);
        utc.Should().Be(new DateTime(y, mo, d, h, mi, s, ms, DateTimeKind.Utc));
    }

    [Theory]
    [InlineData("2024-01-01")]
    [InlineData("2024-01-01T00:00:00")]
    [InlineData("2024-01-01T00:00:00.123")]
    [InlineData("1/2/2024")]
    [InlineData("01/02/2024 10:00:00 +00:00")]
    [InlineData("2024-01-01t10:00:00z")]
    [InlineData("2024-01-01T10:00:00.12345678Z")]
    [InlineData("2024-02-30T10:00:00Z")]
    [InlineData(" 2024-01-01T10:00:00Z")]
    [InlineData("")]
    public void TryParse_OtherForms_Refused(string text)
    {
        RestDateTime.TryParse(text, out var utc).Should().BeFalse();
        utc.Should().Be(default);
    }
}
