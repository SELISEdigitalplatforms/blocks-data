using System;
using FluentValidation.Results;

namespace DataGateway.DomainService.Models.Responses;

public class ServiceResponse<T>
{
    public bool IsSuccess { get; private set; }
    public string? Message { get; private set; }
    public int HttpStatusCode { get; private set; }
    public T? Data { get; private set; }
    public IList<ValidationFailure> Errors { get; private set; }


    public ServiceResponse<T> SetSuccess(T data, int httpStatusCode = 200)
    {
        HttpStatusCode = httpStatusCode;
        IsSuccess = true;
        Data = data;
        Errors = [];
        return this;
    }
    public ServiceResponse<T> SetErrors(IList<ValidationFailure> errors, int httpStatusCode = 400)
    {
        IsSuccess = false;
        Errors = errors;
        HttpStatusCode = httpStatusCode;
        return this;
    }
    public ServiceResponse<T> SetErrorMessage(string message)
    {
        IsSuccess = false;
        Message = message;
        return this;
    }
    public ServiceResponse<T> SetSuccessMessage(string message)
    {
        IsSuccess = true;
        Message = message;
        HttpStatusCode = 200;
        Errors = [];
        return this;
    }
    public ServiceResponse<T> SetHttpStatusCode(int httpStatusCode)
    {
        HttpStatusCode = httpStatusCode;
        return this;
    }


}
