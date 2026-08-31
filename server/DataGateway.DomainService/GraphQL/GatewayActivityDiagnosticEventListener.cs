using System.Diagnostics;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Execution;
using HotChocolate.Execution.Instrumentation;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Tags the ambient <see cref="Activity"/> with a "GatewayOperation" summary for every GraphQL
/// request (query or mutation, any tenant). <see cref="ExecuteRequest"/> is invoked by
/// HotChocolate's own <c>InstrumentationMiddleware</c> — already the first step of its implicit
/// default pipeline — so this needs no pipeline changes at all: it also captures requests that
/// fail before reaching a resolver, e.g. document parse/validation errors, which
/// QueryService/MutationService never see.
///
/// It also decides what a logged failure *was*: the error events below fire while the request is
/// still executing, carrying the original error (and its exception) before the response is
/// serialized and stripped of internal detail.
/// </summary>
internal sealed class GatewayActivityDiagnosticEventListener : ExecutionDiagnosticEventListener
{
    public override IDisposable ExecuteRequest(IRequestContext context) => new RequestScope(context);

    /// <summary>The GraphQL document could not be parsed — the request never ran.</summary>
    public override void SyntaxError(IRequestContext context, IError error) =>
        MarkFailed(GatewayFailureKind.BadRequest, error);

    /// <summary>A resolver rejected or blew up; the error's own code says which.</summary>
    public override void ResolverError(IMiddlewareContext context, IError error) =>
        MarkFailed(Classify(error), error);

    public override void TaskError(IExecutionTask task, IError error) =>
        MarkFailed(Classify(error), error);

    /// <summary>An exception escaped the request pipeline entirely.</summary>
    public override void RequestError(IRequestContext context, Exception exception) =>
        GatewayOperationActivity.MarkFailed(
            Activity.Current, GatewayFailureKind.Unhandled, exception.Message);

    private static void MarkFailed(string failureKind, IError error) =>
        GatewayOperationActivity.MarkFailed(Activity.Current, failureKind, error.Message, error.Code);

    /// <summary>
    /// Reads a failure kind out of a GraphQL error. Used for errors nobody claimed explicitly: an
    /// error carrying an exception is a server-side fault, and HotChocolate's own "HC…" codes mean
    /// the document itself was unusable.
    /// </summary>
    private static string Classify(IError error)
    {
        var code = error.Code ?? string.Empty;

        return code switch
        {
            GraphQlConstant.ValidationErrorErrorCode => GatewayFailureKind.Validation,
            GraphQlConstant.UnauthorizedErrorCode => GatewayFailureKind.Authentication,
            _ when error.Exception is not null => GatewayFailureKind.Unhandled,
            _ when code.StartsWith("HC", StringComparison.Ordinal) => GatewayFailureKind.BadRequest,
            _ => GatewayFailureKind.Unknown,
        };
    }

    private sealed class RequestScope(IRequestContext context) : IDisposable
    {
        private readonly Activity? _activity = Activity.Current;
        private readonly GatewayOperation _gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);

        public void Dispose()
        {
            _gatewayOperation.OperationType = context.Operation?.Type.ToString().ToLowerInvariant();
            _gatewayOperation.OperationQuery = context.Document?.ToString();
            _gatewayOperation.InAppRequest = !(BlocksContext.GetContext()?.Impersonated ?? false);

            var errors = (context.Result as IOperationResult)?.Errors;
            // An error event during execution already flipped the status; keep it, so a logged
            // reason can never sit on a row that claims to have succeeded.
            var hasFailed = context.Exception is not null
                || errors is { Count: > 0 }
                || !string.IsNullOrEmpty(_gatewayOperation.FailureKind);
            _gatewayOperation.ResponseStatus = hasFailed ? "failed" : "success";

            // Whoever rejected the request already said why — only fill in what nobody claimed,
            // e.g. document validation errors, which raise no error event of their own.
            if (hasFailed && string.IsNullOrEmpty(_gatewayOperation.FailureKind))
                ClassifyResult(errors?.FirstOrDefault());

            GatewayOperationActivity.Tag(_activity, _gatewayOperation);
        }

        private void ClassifyResult(IError? error)
        {
            if (context.Exception is not null)
            {
                _gatewayOperation.FailureKind = GatewayFailureKind.Unhandled;
                _gatewayOperation.FailureMessage = context.Exception.Message;
                return;
            }

            if (error is null)
            {
                _gatewayOperation.FailureKind = GatewayFailureKind.Unknown;
                return;
            }

            _gatewayOperation.FailureKind = Classify(error);
            _gatewayOperation.FailureCode = error.Code ?? string.Empty;
            _gatewayOperation.FailureMessage = error.Message ?? string.Empty;
        }
    }
}
