using FluentAssertions;
using Storage.DomainService.Storage.ZipDownload;
using Storage.DomainService.Storage.Validators;

namespace XUnitTest.Storage;

public class PrepareZipDownloadRequestValidatorTests
{
    private static FluentValidation.Results.ValidationResult Validate(PrepareZipDownloadRequest request) =>
        new PrepareZipDownloadRequestValidator().Validate(request);

    private static List<string> Ids(int n) => Enumerable.Range(0, n).Select(i => $"id-{i}").ToList();

    [Fact]
    public void Empty_selection_is_invalid() =>
        Validate(new()).IsValid.Should().BeFalse();

    [Fact]
    public void One_directory_is_valid() =>
        Validate(new() { DirectoryIds = ["d1"] }).IsValid.Should().BeTrue();

    [Fact]
    public void Exactly_1000_ids_is_valid() =>
        Validate(new() { FileIds = Ids(600), DirectoryIds = Ids(400) }).IsValid.Should().BeTrue();

    [Fact]
    public void Over_1000_ids_is_invalid() =>
        Validate(new() { FileIds = Ids(600), DirectoryIds = Ids(401) }).IsValid.Should().BeFalse();

    [Fact]
    public void Blank_id_is_invalid() =>
        Validate(new() { FileIds = ["f1", " "] }).IsValid.Should().BeFalse();
}
