using FluentValidation;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Validators;

public class PolicyRuleValidator : AbstractValidator<PolicyRule>
{
    public PolicyRuleValidator()
    {
        RuleFor(x => x.LeftSource).IsInEnum();
        RuleFor(x => x.LeftOperand)
            .NotEmpty()
            .MaximumLength(512);
        RuleFor(x => x.Operator).IsInEnum();
        RuleFor(x => x.RightSource).IsInEnum();
        RuleFor(x => x.RightOperand)
            .MaximumLength(512);
        RuleFor(x => x.Description)
            .MaximumLength(2000)
            .When(x => x.Description is not null);
    }
}
