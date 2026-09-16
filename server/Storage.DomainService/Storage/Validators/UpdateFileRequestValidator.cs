using DomainService.Storage;
using FluentValidation;

namespace Storage.DomainService.Storage.Validators
{
    public class UpdateFileRequestValidator : AbstractValidator<UpdateFileRequest>
    {
        public UpdateFileRequestValidator()
        {
            RuleFor(u => u.ItemId).NotEmpty().NotNull();

            RuleFor(u => u.ObjectAccessLevel)
                .Must(DmsValidationRules.BeAValidObjectAccessLevel)
                .When(u => u.UpdateObjectAccessLevel)
                .WithMessage("ObjectAccessLevel must be 'Creator' or 'Organization'.");
        }
    }
}
