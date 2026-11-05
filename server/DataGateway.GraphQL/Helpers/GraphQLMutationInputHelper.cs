using DataGateway.DomainService.Models.Constants;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// GraphQL-facing mutation input helper: parses the input from the resolver context. The path, CLS and
/// default helpers live in <see cref="MutationInputHelper"/>.
/// </summary>
public static class GraphQLMutationInputHelper
{
    /// <summary>Parses the mutation input from the resolver context.</summary>
    public static Dictionary<string, object?> ParseMutationInput(IResolverContext context, InputObjectType inputType)
    {
        var inputLiteral = context.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName) as ObjectValueNode;
        var input = new Dictionary<string, object?>();
        input.MapMutationInput(inputLiteral, inputType);
        return input;
    }

    /// <summary>Returns true if the request asks for hard delete.</summary>
    public static bool IsHardDeleteRequested(IResolverContext context, InputObjectType inputType)
    {
        var input = ParseMutationInput(context, inputType);
        return input.TryGetValue(GraphQlConstant.HardDeleteFieldName, out var value) && value is bool hardDelete && hardDelete;
    }
}
