using DataGateway.DomainService.Models.Constants;
using HotChocolate;
using HotChocolate.Language;
using HotChocolate.Validation;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Validation rule: an operation may select at most <see cref="GraphQlConstant.MaxRootFieldsPerOperation"/>
/// root fields. Every root field (<c>get…s</c>, <c>insert…</c>, <c>bulkUpdate…</c>, …) runs its own
/// database calls, and GraphQL lets a request repeat the same root field under different aliases, so
/// without this cap one request could fan out into hundreds of database calls. Aliases count
/// separately (each is resolved on its own); fields reached through fragments count; introspection
/// meta fields (<c>__typename</c>, …) do not. Validation runs before execution, so a rejected request
/// makes no database call.
/// </summary>
public sealed class MaxRootFieldsRule : IDocumentValidatorRule
{
    private readonly int _maxRootFields;

    public MaxRootFieldsRule(int maxRootFields)
    {
        if (maxRootFields < 1) throw new ArgumentOutOfRangeException(nameof(maxRootFields), "At least one root field must be allowed.");
        _maxRootFields = maxRootFields;
    }

    public ushort Priority => 0;

    // The verdict depends only on the document, so HotChocolate may cache it per document.
    public bool IsCacheable => true;

    public void Validate(IDocumentValidatorContext context, DocumentNode document)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(document);

        var fragments = document.Definitions
            .OfType<FragmentDefinitionNode>()
            .ToDictionary(fragment => fragment.Name.Value, fragment => fragment, StringComparer.Ordinal);

        foreach (var operation in document.Definitions.OfType<OperationDefinitionNode>())
        {
            var rootFields = CountRootFields(operation.SelectionSet, fragments, new HashSet<string>(StringComparer.Ordinal));
            if (rootFields > _maxRootFields)
            {
                context.ReportError(ErrorBuilder.New()
                    .SetMessage(
                        "The {0} selects {1} root fields; at most {2} are allowed per operation.",
                        operation.Operation.ToString().ToLowerInvariant(), rootFields, _maxRootFields)
                    .SetCode(GraphQlConstant.TooManyRootFieldsErrorCode)
                    .AddLocation(operation)
                    .Build());
            }
        }
    }

    private static int CountRootFields(
        SelectionSetNode selectionSet,
        IReadOnlyDictionary<string, FragmentDefinitionNode> fragments,
        HashSet<string> visitedFragments)
    {
        var count = 0;
        foreach (var selection in selectionSet.Selections)
        {
            switch (selection)
            {
                case FieldNode field:
                    if (!field.Name.Value.StartsWith("__", StringComparison.Ordinal))
                        count++;
                    break;

                case InlineFragmentNode inlineFragment:
                    count += CountRootFields(inlineFragment.SelectionSet, fragments, visitedFragments);
                    break;

                case FragmentSpreadNode spread:
                    // Each fragment is counted once; a cycle is reported by HotChocolate's own rule.
                    if (visitedFragments.Add(spread.Name.Value) && fragments.TryGetValue(spread.Name.Value, out var fragment))
                        count += CountRootFields(fragment.SelectionSet, fragments, visitedFragments);
                    break;
            }
        }

        return count;
    }
}
