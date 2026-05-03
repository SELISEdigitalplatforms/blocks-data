using FluentValidation;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Validators;

public class PolicyRuleGroupValidator : AbstractValidator<PolicyRuleGroup>
{
    public PolicyRuleGroupValidator()
    {
        RuleFor(x => x.LogicalOperator).IsInEnum();
        RuleForEach(x => x.Rules).SetValidator(new PolicyRuleValidator());
        RuleForEach(x => x.NestedGroups).SetValidator(this);
    }
}
