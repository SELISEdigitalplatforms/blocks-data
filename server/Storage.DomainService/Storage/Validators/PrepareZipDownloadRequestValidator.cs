using FluentValidation;
using Storage.DomainService.Storage.ZipDownload;

namespace Storage.DomainService.Storage.Validators
{
    public class PrepareZipDownloadRequestValidator : AbstractValidator<PrepareZipDownloadRequest>
    {
        public PrepareZipDownloadRequestValidator()
        {
            RuleFor(r => r)
                .Must(r =>
                {
                    var total = (r.FileIds?.Count ?? 0) + (r.DirectoryIds?.Count ?? 0);
                    return total > 0 && total <= ZipDownloadLimits.MaxRequestIds;
                })
                .WithMessage($"Select between 1 and {ZipDownloadLimits.MaxRequestIds} items.");
            RuleForEach(r => r.FileIds).NotEmpty();
            RuleForEach(r => r.DirectoryIds).NotEmpty();
        }
    }
}
