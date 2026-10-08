using DataGateway.DomainService.Helpers;
using FluentAssertions;

namespace XUnitTest.DataGateway;

public class LogMaskingTests
{
    [Theory]
    [InlineData("johne.doe@gmail.com", "joh*******@gmail.com")]
    [InlineData("  johne.doe@gmail.com ", "joh*******@gmail.com")]
    [InlineData("jo@example.com", "j*******@example.com")]
    [InlineData("j@example.com", "*******@example.com")]
    public void MaskEmail_KeepsTheStartOfTheAddressAndTheDomain(string email, string expected)
    {
        LogMasking.MaskEmail(email).Should().Be(expected);
    }

    [Fact]
    public void MaskEmail_DoesNotRevealTheLengthOfTheAddress()
    {
        LogMasking.MaskEmail("johnathan.doe@gmail.com").Should().Be(LogMasking.MaskEmail("johnny@gmail.com"));
    }

    [Theory]
    [InlineData("not-an-email", "not*******")]
    [InlineData("someone@", "som*******")]
    [InlineData("@example.com", "@ex*******")]
    public void MaskEmail_MasksAValueThatIsNotAnAddressAsText(string value, string expected)
    {
        LogMasking.MaskEmail(value).Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void MaskEmail_ReturnsEmptyForNoValue(string? value)
    {
        LogMasking.MaskEmail(value).Should().BeEmpty();
    }

    [Theory]
    [InlineData("Kazi Lakit", "Kaz*******")]
    [InlineData("Kazi", "K*******")]
    [InlineData("K", "*******")]
    public void MaskText_KeepsOnlyTheStart(string value, string expected)
    {
        LogMasking.MaskText(value).Should().Be(expected);
    }
}
