using FluentAssertions;
using Storage.DomainService.Enums;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the single read-blocking gate every content-returning read path applies: Quarantined and
/// Rejected always deny; missing/null and Unverified are legacy-ready and fall through to the existing
/// access policy unchanged.
/// </summary>
public class ReadReadinessPolicyTests
{
    [Theory]
    [InlineData(FileVerificationStatus.Quarantined)]
    [InlineData(FileVerificationStatus.Rejected)]
    public void IsContentReadable_QuarantinedOrRejected_IsFalse(FileVerificationStatus status)
    {
        ReadReadinessPolicy.IsContentReadable(status).Should().BeFalse();
    }

    [Theory]
    [InlineData(FileVerificationStatus.Unverified)]
    [InlineData(FileVerificationStatus.Verified)]
    public void IsContentReadable_UnverifiedOrVerified_IsTrue(FileVerificationStatus status)
    {
        ReadReadinessPolicy.IsContentReadable(status).Should().BeTrue();
    }

    [Fact]
    public void IsContentReadable_MissingLegacyValue_IsTrue()
    {
        ReadReadinessPolicy.IsContentReadable(null).Should().BeTrue();
    }
}
