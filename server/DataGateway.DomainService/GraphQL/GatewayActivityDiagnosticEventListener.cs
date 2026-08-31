using System.Diagnostics;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using HotChocolate.Execution;
using HotChocolate.Execution.Instrumentation;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Tags the ambient <see cref="Activity"/> with a "GatewayOperation" summary for every GraphQL
/// request (query or mutation, any tenant). <see cref="ExecuteRequest"/> is invoked by
/// HotChocolate's own <c>InstrumentationMiddleware</c> — already the first step of its implicit
/// default pipeline — so this needs no pipeline changes at all: it also captures requests that
/// fail before reaching a resolver, e.g. document parse/validation errors, which
/// QueryService/MutationService never see.
/// </summary>
internal sealed class GatewayActivityDiagnosticEventListener : ExecutionDiagnosticEventListener
{
    public override IDisposable ExecuteRequest(IRequestContext context) => new RequestScope(context);

    private sealed class RequestScope(IRequestContext context) : IDisposable
    {
        private readonly Activity? _activity = Activity.Current;
        private readonly GatewayOperation _gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);

        public void Dispose()
        {
            _gatewayOperation.OperationType = context.Operation?.Type.ToString().ToLowerInvariant();
            _gatewayOperation.OperationQuery = context.Document?.ToString();
            _gatewayOperation.InAppRequest = !(BlocksContext.GetContext()?.Impersonated ?? false);
            _gatewayOperation.ResponseStatus = context.Exception is not null
                || context.Result is IOperationResult { Errors.Count: > 0 }
                    ? "failed"
                    : "success";

            GatewayOperationActivity.Tag(_activity, _gatewayOperation);
        }
    }
}
