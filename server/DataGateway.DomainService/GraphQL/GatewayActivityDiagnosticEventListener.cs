using System.Diagnostics;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Execution;
using HotChocolate.Execution.Instrumentation;
using HotChocolate.Language;
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
        MarkFailed(Classify(error, CurrentStatusCode), error);

    public override void TaskError(IExecutionTask task, IError error) =>
        MarkFailed(Classify(error, CurrentStatusCode), error);

    /// <summary>An exception escaped the request pipeline entirely.</summary>
    public override void RequestError(IRequestContext context, Exception exception) =>
        GatewayOperationActivity.MarkFailed(
            Activity.Current,
            GatewayFailureKind.IsServerErrorStatus(CurrentStatusCode)
                ? GatewayFailureKind.Unhandled
                : GatewayFailureKind.Unknown,
            exception.Message);

    private static void MarkFailed(string failureKind, IError error) =>
        GatewayOperationActivity.MarkFailed(Activity.Current, failureKind, error.Message, error.Code);

    /// <summary>
    /// Reads a failure kind out of a GraphQL error. Used for errors nobody claimed explicitly.
    /// HotChocolate's own "HC…" codes mean the document itself was unusable, even when its
    /// implementation attaches an exception. An otherwise unexpected error is called a server
    /// error only when the HTTP response is 5xx.
    /// </summary>
    internal static string Classify(IError error, int statusCode)
    {
        var code = error.Code ?? string.Empty;

        return code switch
        {
            GraphQlConstant.ValidationErrorErrorCode => GatewayFailureKind.Validation,
            GraphQlConstant.UnauthorizedErrorCode => GatewayFailureKind.Authentication,
            _ when code.StartsWith("HC", StringComparison.Ordinal) => GatewayFailureKind.BadRequest,
            _ when GatewayFailureKind.IsServerErrorStatus(statusCode) => GatewayFailureKind.Unhandled,
            _ => GatewayFailureKind.Unknown,
        };
    }

    private static int CurrentStatusCode =>
        RequestContextAccessor.Current.HttpContext?.Response.StatusCode ?? 0;

    private sealed class RequestScope(IRequestContext context) : IDisposable
    {
        private readonly Activity? _activity = Activity.Current;
        private readonly GatewayOperation _gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);

        public void Dispose()
        {
            var documentOperation = GraphQLOperationHelper.GetFirstOperation(context.Document);
            _gatewayOperation.OperationType = context.Operation?.Type.ToString().ToLowerInvariant()
                ?? documentOperation?.Operation.ToString().ToLowerInvariant();
            _gatewayOperation.OperationQuery = context.Document?.ToString();
            // Document validation happens before a resolver runs, so QueryService/MutationService
            // cannot normally populate this field for malformed requests. Preserve the root field
            // from the parsed document so those requests are still attributable in history.
            if (string.IsNullOrWhiteSpace(_gatewayOperation.SchemaName))
            {
                _gatewayOperation.SchemaName = GraphQLOperationHelper.GetFirstRootFieldName(
                    context.Document, documentOperation);
            }
            _gatewayOperation.IsIntrospection = context.Document is not null
                && GraphQLIntrospectionHelper.ContainsIntrospectionQuery(context.Document);
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
            if (error is not null)
            {
                _gatewayOperation.FailureKind = Classify(error, CurrentStatusCode);
                _gatewayOperation.FailureCode = error.Code ?? string.Empty;
                _gatewayOperation.FailureMessage = error.Message ?? string.Empty;
                return;
            }

            if (context.Exception is not null)
            {
                _gatewayOperation.FailureKind = GatewayFailureKind.IsServerErrorStatus(CurrentStatusCode)
                    ? GatewayFailureKind.Unhandled
                    : GatewayFailureKind.Unknown;
                _gatewayOperation.FailureMessage = context.Exception.Message;
                return;
            }

            _gatewayOperation.FailureKind = GatewayFailureKind.Unknown;
        }
    }
}

/// <summary>Best-effort metadata recovery for documents that fail before resolver execution.</summary>
internal static class GraphQLOperationHelper
{
    public static OperationDefinitionNode? GetFirstOperation(DocumentNode? document) =>
        document?.Definitions.OfType<OperationDefinitionNode>().FirstOrDefault();

    public static string? GetFirstRootFieldName(
        DocumentNode? document,
        OperationDefinitionNode? operation = null)
    {
        if (document is null)
            return null;

        operation ??= GetFirstOperation(document);
        if (operation is null)
            return null;

        var fragments = document.Definitions
            .OfType<FragmentDefinitionNode>()
            .ToDictionary(fragment => fragment.Name.Value, fragment => fragment);

        return FindFirstField(operation.SelectionSet, fragments, new HashSet<string>());
    }

    private static string? FindFirstField(
        SelectionSetNode selectionSet,
        IReadOnlyDictionary<string, FragmentDefinitionNode> fragments,
        HashSet<string> visitedFragments)
    {
        foreach (var selection in selectionSet.Selections)
        {
            switch (selection)
            {
                case FieldNode field:
                    return field.Name.Value;

                case InlineFragmentNode inlineFragment:
                {
                    var fieldName = FindFirstField(
                        inlineFragment.SelectionSet, fragments, visitedFragments);
                    if (fieldName is not null)
                        return fieldName;
                    break;
                }

                case FragmentSpreadNode fragmentSpread
                    when visitedFragments.Add(fragmentSpread.Name.Value)
                         && fragments.TryGetValue(fragmentSpread.Name.Value, out var fragment):
                {
                    var fieldName = FindFirstField(fragment.SelectionSet, fragments, visitedFragments);
                    if (fieldName is not null)
                        return fieldName;
                    break;
                }
            }
        }

        return null;
    }
}
