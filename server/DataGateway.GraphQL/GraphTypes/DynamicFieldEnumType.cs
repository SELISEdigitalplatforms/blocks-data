using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// Dynamically-named HotChocolate <see cref="EnumType"/> for one schema field's allowed values.
/// Runtime values are the enum member names (strings) so entity storage stays plain strings.
/// GraphQL names keep the author-supplied casing (e.g. <c>Active</c>, not <c>ACTIVE</c>).
/// </summary>
public sealed class DynamicFieldEnumType : EnumType
{
    private readonly string _typeName;
    private readonly IReadOnlyList<string> _values;

    public DynamicFieldEnumType(string typeName, IReadOnlyList<string> values)
    {
        _typeName = typeName;
        _values = values;
    }

    protected override void Configure(IEnumTypeDescriptor descriptor)
    {
        descriptor.Name(_typeName);
        descriptor.Description($"Allowed values for {_typeName}.");
        foreach (var value in _values)
        {
            descriptor.Value(value).Name(value);
        }
    }
}
