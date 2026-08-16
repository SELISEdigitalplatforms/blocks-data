using DomainService.Storage;
using FluentValidation;

namespace Storage.DomainService.Storage.Validators
{
    public class UpdateFileRequestValidator : AbstractValidator<UpdateFileRequest>
    {
        public UpdateFileRequestValidator()
        {
            RuleFor(u => u.ItemId).NotEmpty().NotNull();
        }
    }
}
