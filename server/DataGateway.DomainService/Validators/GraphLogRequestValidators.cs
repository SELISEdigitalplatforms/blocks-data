using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentValidation;

namespace DataGateway.DomainService.Validators;

public class GetGraphLogHistoryRequestValidator : AbstractValidator<GetGraphLogHistoryRequest>
{
    public GetGraphLogHistoryRequestValidator()
    {
        RuleFor(x => x.Transport)
            .Must(GraphLogTransport.IsValidFilter).WithMessage(GraphLogTransport.InvalidFilterMessage);
    }
}

public class GetGraphLogAnalyticsRequestValidator : AbstractValidator<GetGraphLogAnalyticsRequest>
{
    public GetGraphLogAnalyticsRequestValidator()
    {
        RuleFor(x => x.Transport)
            .Must(GraphLogTransport.IsValidFilter).WithMessage(GraphLogTransport.InvalidFilterMessage);
    }
}
