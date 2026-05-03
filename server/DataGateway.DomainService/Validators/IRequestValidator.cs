using System;
using FluentValidation.Results;

namespace DataGateway.DomainService.Validators;

public interface IRequestValidator
{
    Task<ValidationResult> ValidateAsync<T>(T request);
    ValidationResult Validate<T>(T request);
}