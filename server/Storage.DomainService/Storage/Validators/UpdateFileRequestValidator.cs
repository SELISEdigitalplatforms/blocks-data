using DomainService.Storage;
using FluentValidation;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

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
