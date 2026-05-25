using FluentValidation;
using FluentValidation.Results;
using System;
using System.Threading.Tasks;

namespace DataGateway.DomainService.Validators;


public class RequestValidator : IRequestValidator
{
    private readonly IServiceProvider _serviceProvider;

    public RequestValidator(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public ValidationResult Validate<T>(T request)
    {
        if (_serviceProvider.GetService(typeof(IValidator<T>)) is not IValidator<T> validator)
            throw new InvalidOperationException($"No validator found for type {typeof(T).Name}");
        return validator.Validate(request);
    }

    public async Task<ValidationResult> ValidateAsync<T>(T request)
    {
        if (_serviceProvider.GetService(typeof(IValidator<T>)) is not IValidator<T> validator)
            throw new InvalidOperationException($"No validator found for type {typeof(T).Name}");
        return await validator.ValidateAsync(request);
    }
}
