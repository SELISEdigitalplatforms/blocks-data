using Blocks.Genesis.Entities.Data;
using FluentAssertions;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// The upload limits of blocks-data#441 (spec §6.1): the effective limit is the configured value (or the 5 MiB default)
/// capped at 100 MiB, the local upload path never refuses a file of up to 15 MiB, and the uncapped
/// <see cref="StorageConfigurationExtensions.GetMaxFileSizeInBytes"/> that Storage.Driver consumers call is unchanged.
/// </summary>
public class StorageConfigurationLimitTests
{
    private static StorageConfiguration Configured(long? maxFileSizeInBytes) =>
        new() { Name = "Default", MaxFileSizeInBytes = maxFileSizeInBytes };

    [Fact]
    public void Ceiling_and_limits_are_the_spec_values()
    {
        Constants.MaxUploadSizeInBytes.Should().Be(100 * 1024 * 1024);
        Constants.LocalUploadAcceptedSizeInBytes.Should().Be(15 * 1024 * 1024);
        Constants.LocalUploadMaxRequestBodyInBytes.Should().Be(101 * 1024 * 1024);
    }

    // H1, H2, H3, C2
    [Theory]
    [InlineData(null, 5_242_880L)]
    [InlineData(0L, 5_242_880L)]
    [InlineData(-1L, 5_242_880L)]
    [InlineData(5_242_880L, 5_242_880L)]
    [InlineData(52_428_800L, 52_428_800L)]
    [InlineData(104_857_600L, 104_857_600L)]
    [InlineData(104_857_601L, 104_857_600L)]
    [InlineData(209_715_200L, 104_857_600L)]
    public void H1_H2_H3_C2_effective_limit_is_the_configured_value_capped_at_100_MiB(long? configured, long expected)
    {
        Configured(configured).GetEffectiveMaxFileSizeInBytes().Should().Be(expected);
    }

    // H2, H3, C2, C20 (A21)
    [Theory]
    [InlineData(null, 15_728_640L)]
    [InlineData(0L, 15_728_640L)]
    [InlineData(-1L, 15_728_640L)]
    [InlineData(5_242_880L, 15_728_640L)]
    [InlineData(10_485_760L, 15_728_640L)]
    [InlineData(15_728_640L, 15_728_640L)]
    [InlineData(52_428_800L, 52_428_800L)]
    [InlineData(104_857_600L, 104_857_600L)]
    [InlineData(209_715_200L, 104_857_600L)]
    public void H2_H3_C2_C20_local_acceptance_limit_is_never_below_15_MiB(long? configured, long expected)
    {
        FileManagementService.LocalUploadMaxFileSizeInBytes(Configured(configured)).Should().Be(expected);
    }

    // C21 (A7 b): exactly what 4f6b578a returns, including values above the ceiling.
    [Theory]
    [InlineData(null, 5_242_880L)]
    [InlineData(0L, 5_242_880L)]
    [InlineData(-1L, 5_242_880L)]
    [InlineData(5_242_880L, 5_242_880L)]
    [InlineData(52_428_800L, 52_428_800L)]
    [InlineData(104_857_600L, 104_857_600L)]
    [InlineData(209_715_200L, 209_715_200L)]
    public void C21_GetMaxFileSizeInBytes_is_unchanged_and_uncapped(long? configured, long expected)
    {
        Configured(configured).GetMaxFileSizeInBytes().Should().Be(expected);
    }
}
