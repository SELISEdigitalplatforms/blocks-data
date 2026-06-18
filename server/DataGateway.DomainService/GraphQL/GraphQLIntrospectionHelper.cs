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

    private static bool ContainsIntrospectionQuery(string query)
    {
        var document = Utf8GraphQLParser.Parse(query);
        var fragments = document.Definitions
            .OfType<FragmentDefinitionNode>()
            .ToDictionary(fragment => fragment.Name.Value, fragment => fragment);

        foreach (var definition in document.Definitions)
        {
            if (definition is OperationDefinitionNode operation
                && operation.Operation == OperationType.Query
                && SelectionSetContainsIntrospection(operation.SelectionSet, fragments))
            {
                return true;
            }
        }

        return false;
    }

    private static bool SelectionSetContainsIntrospection(
        SelectionSetNode? selectionSet,
        IReadOnlyDictionary<string, FragmentDefinitionNode> fragments)
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

                    if (SelectionSetContainsIntrospection(field.SelectionSet, fragments))
                    {
                        return true;
                    }

                    break;

                case InlineFragmentNode inlineFragment:
                    if (SelectionSetContainsIntrospection(inlineFragment.SelectionSet, fragments))
                    {
                        return true;
                    }

                    break;

                case FragmentSpreadNode fragmentSpread:
                    if (fragments.TryGetValue(fragmentSpread.Name.Value, out var fragment)
                        && SelectionSetContainsIntrospection(fragment.SelectionSet, fragments))
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
