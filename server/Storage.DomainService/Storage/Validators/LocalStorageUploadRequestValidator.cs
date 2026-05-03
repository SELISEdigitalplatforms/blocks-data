using FluentValidation;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;

namespace DomainService.Storage.Validators
{
    public class LocalStorageUploadRequestValidator : AbstractValidator<LocalStorageUploadRequest>
    {
        public LocalStorageUploadRequestValidator(IDirectoryRepository directoryRepository)
        {

            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required.")
                .Must(name => Path.HasExtension(name))
                .WithMessage("File name must have an extension.")
                .Must(name =>
                {
                    var ext = Path.GetExtension(name).ToLower();
                    return !UnsupportedFile.Extensions.Contains(ext);
                })
                .WithMessage(x => $"File extension {Path.GetExtension(x.Name).ToLower()} is not supported.");

            RuleFor(x => x.File)
                .NotEmpty()
                .WithMessage("File is required.");

            RuleFor(x => x.ConfigurationName)
                .NotEmpty()
                .WithMessage("Configuration Name should not be empty. Remove this field only if you wish to use the default configuration.")
                .When(x => x.ConfigurationName != null);
        }
    }
}
