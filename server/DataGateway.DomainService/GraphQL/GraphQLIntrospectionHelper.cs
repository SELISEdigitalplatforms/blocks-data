using System.Text;
using System.Text.Json;
using HotChocolate.Language;
using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService.GraphQL;

internal static class GraphQLIntrospectionHelper
{
    public static async Task<bool> ContainsIntrospectionQueryAsync(
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        foreach (var query in await ReadQueriesAsync(request, cancellationToken))
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                continue;
            }

            try
            {
                if (ContainsIntrospectionQuery(query))
                {
                    return true;
                }
            }
            catch
            {
                // Ignore parse errors; Hot Chocolate will report them later.
            }
        }

        return false;
    }

    private static bool ContainsIntrospectionQuery(string query) =>
        ContainsIntrospectionQuery(Utf8GraphQLParser.Parse(query));

    /// <summary>
    /// Whether a parsed document asks for schema introspection (<c>__schema</c> / <c>__type</c>,
    /// including through fragments). Note this is a field-name match, so the everyday
    /// <c>__typename</c> is correctly not treated as introspection.
    /// </summary>
    /// <remarks>
    /// This runs on the raw request before HotChocolate validates it, so the document may be
    /// invalid: fragments can spread themselves (a cycle) or spread the same fragment many times
    /// over (exponential fan-out). Each fragment is therefore walked at most once per document —
    /// enough for a yes/no answer, and it keeps the walk linear in the document size.
    /// </remarks>
    public static bool ContainsIntrospectionQuery(DocumentNode document)
    {
        var fragments = document.Definitions
            .OfType<FragmentDefinitionNode>()
            .ToDictionary(fragment => fragment.Name.Value, fragment => fragment);
        var visitedFragments = new HashSet<string>(StringComparer.Ordinal);

        foreach (var definition in document.Definitions)
        {
            if (definition is OperationDefinitionNode operation
                && operation.Operation == OperationType.Query
                && SelectionSetContainsIntrospection(operation.SelectionSet, fragments, visitedFragments))
            {
                return true;
            }
        }

        return false;
    }

    private static bool SelectionSetContainsIntrospection(
        SelectionSetNode? selectionSet,
        IReadOnlyDictionary<string, FragmentDefinitionNode> fragments,
        HashSet<string> visitedFragments)
    {
        if (selectionSet is null)
        {
            return false;
        }

        foreach (var selection in selectionSet.Selections)
        {
            switch (selection)
            {
                case FieldNode field:
                    if (field.Name.Value is "__schema" or "__type")
                    {
                        return true;
                    }

                    if (SelectionSetContainsIntrospection(field.SelectionSet, fragments, visitedFragments))
                    {
                        return true;
                    }

                    break;

                case InlineFragmentNode inlineFragment:
                    if (SelectionSetContainsIntrospection(inlineFragment.SelectionSet, fragments, visitedFragments))
                    {
                        return true;
                    }

                    break;

                case FragmentSpreadNode fragmentSpread:
                    // A fragment already walked (or currently being walked, in a cycle) has nothing
                    // new to add: had it contained introspection, the walk would have returned.
                    if (visitedFragments.Add(fragmentSpread.Name.Value)
                        && fragments.TryGetValue(fragmentSpread.Name.Value, out var fragment)
                        && SelectionSetContainsIntrospection(fragment.SelectionSet, fragments, visitedFragments))
                    {
                        return true;
                    }

                    break;
            }
        }

        return false;
    }

    private static async Task<IReadOnlyList<string>> ReadQueriesAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        if (HttpMethods.IsGet(request.Method))
        {
            return request.Query.TryGetValue("query", out var query)
                ? [query.ToString()]
                : [];
        }

        if (!request.Body.CanSeek)
        {
            request.EnableBuffering();
        }

        request.Body.Position = 0;
        using var reader = new StreamReader(request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var body = await reader.ReadToEndAsync(cancellationToken);
        request.Body.Position = 0;

        if (string.IsNullOrWhiteSpace(body))
        {
            return [];
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.ValueKind switch
            {
                JsonValueKind.Object => [ReadQueryProperty(document.RootElement)],
                JsonValueKind.Array => document.RootElement.EnumerateArray()
                    .Select(ReadQueryProperty)
                    .Where(query => !string.IsNullOrWhiteSpace(query))
                    .ToArray(),
                _ => []
            };
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string ReadQueryProperty(JsonElement element)
        => element.TryGetProperty("query", out var query) ? query.GetString() ?? string.Empty : string.Empty;
}
