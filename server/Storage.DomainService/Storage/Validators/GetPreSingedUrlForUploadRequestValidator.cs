using FluentValidation;
using Storage.DomainService.Storage.Validators;

namespace DomainService.Storage.Validators
{
    public class GetPreSignedUrlForUploadRequestValidator : AbstractValidator<GetPreSignedUrlForUploadRequest>
    {
        public GetPreSignedUrlForUploadRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required.");

            RuleFor(x => x.ConfigurationName)
                .NotEmpty()
                .WithMessage("Configuration Name should not be empty. Remove this field only if you wish to use the default configuration.")
                .When(x => x.ConfigurationName != null);

            RuleFor(x => x.ObjectAccessLevel)
                .Must(DmsValidationRules.BeAValidObjectAccessLevel)
                .WithMessage("ObjectAccessLevel must be 'Creator' or 'Organization'.");
        }
    }
}
