using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Language;
using HotChocolate.Types;

namespace XUnitTest.DataGateway.Helpers;

/// <summary>
/// Exercises the descriptor extensions that translate a stored field definition into a HotChocolate
/// field. The interesting behaviour is the resolver each branch installs: it reads the value out of
/// the dictionary the storage layer hands back, so the tests build a real schema and execute a query
/// against it rather than asserting on the descriptor calls.
/// </summary>
public class DescriptorHelperTests
{
    private static FieldDefinitionResponse Field(
        string name,
        string type,
        bool isArray = false,
        string? description = null) => new()
        {
            Name = name,
            Type = type,
            IsArray = isArray,
            Description = description!
        };

    /// <summary>
    /// Builds a schema whose single query field returns <paramref name="row"/> typed as the object
    /// type assembled from <paramref name="fields"/>. An "Address" object type is always present so
    /// non-scalar field types resolve.
    /// </summary>
    private static ISchema BuildSchema(object? row, params FieldDefinitionResponse[] fields)
    {
        return SchemaBuilder.New()
            .AddQueryType(descriptor => descriptor
                .Name("Query")
                .Field("row")
                .Type(new NamedTypeNode("Person"))
                .Resolve(_ => row))
            .AddType(new ObjectType(descriptor =>
            {
                descriptor.Name("Person");
                foreach (var field in fields)
                {
                    descriptor.ResolveObjectTypeDescriptor(field);
                }
            }))
            .AddType(new ObjectType(descriptor =>
            {
                descriptor.Name("Address");
                descriptor.ResolveCustomObjectTypeField(Field("City", "String"));
            }))
            .Create();
    }

    private static async Task<IOperationResult> ExecuteAsync(ISchema schema, string query)
        => (IOperationResult)await schema.MakeExecutable().ExecuteAsync(query);

    // ---------------- ResolveObjectTypeDescriptor ----------------

    [Fact]
    public void ObjectTypeDescriptor_MapsAScalarFieldToItsGraphQlScalar()
    {
        var schema = BuildSchema(null, Field("Name", "String"), Field("Age", "Int"));

        var person = schema.GetType<ObjectType>("Person");

        person.Fields["Name"].Type.Print().Should().Be("String");
        person.Fields["Age"].Type.Print().Should().Be("Int");
    }

    [Fact]
    public void ObjectTypeDescriptor_WrapsAScalarArrayInAListType()
    {
        var schema = BuildSchema(null, Field("Tags", "String", isArray: true));

        schema.GetType<ObjectType>("Person").Fields["Tags"].Type.Print().Should().Be("[String]");
    }

    [Fact]
    public void ObjectTypeDescriptor_UsesTheCustomTypeNameForANonScalarField()
    {
        var schema = BuildSchema(null, Field("Home", "Address"));

        schema.GetType<ObjectType>("Person").Fields["Home"].Type.Print().Should().Be("Address");
    }

    [Fact]
    public void ObjectTypeDescriptor_WrapsANonScalarArrayInAListType()
    {
        var schema = BuildSchema(null, Field("Addresses", "Address", isArray: true));

        schema.GetType<ObjectType>("Person").Fields["Addresses"].Type.Print().Should().Be("[Address]");
    }

    [Fact]
    public void ObjectTypeDescriptor_CarriesTheDescriptionThroughAndDefaultsItToEmpty()
    {
        var schema = BuildSchema(
            null,
            Field("Name", "String", description: "the person name"),
            Field("Age", "Int"));

        var person = schema.GetType<ObjectType>("Person");
        person.Fields["Name"].Description.Should().Be("the person name");
        person.Fields["Age"].Description.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task ScalarResolver_ReadsTheValueOutOfTheParentDictionary()
    {
        var row = new Dictionary<string, object> { ["Name"] = "Ada", ["Age"] = 36 };
        var schema = BuildSchema(row, Field("Name", "String"), Field("Age", "Int"));

        var result = await ExecuteAsync(schema, "{ row { Name Age } }");

        result.Errors.Should().BeNullOrEmpty();
        var person = (IReadOnlyDictionary<string, object?>)result.Data!["row"]!;
        person["Name"].Should().Be("Ada");
        person["Age"].Should().Be(36);
    }

    [Fact]
    public async Task ScalarResolver_ReturnsNullWhenTheKeyIsAbsent()
    {
        var schema = BuildSchema(new Dictionary<string, object>(), Field("Name", "String"));

        var result = await ExecuteAsync(schema, "{ row { Name } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Name"].Should().BeNull();
    }

    [Fact]
    public async Task ScalarResolver_ReturnsNullWhenTheParentIsNotADictionary()
    {
        // A non-dictionary row (for example a POCO) is not an error, the field simply resolves null.
        var schema = BuildSchema("not a dictionary", Field("Name", "String"));

        var result = await ExecuteAsync(schema, "{ row { Name } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Name"].Should().BeNull();
    }

    [Fact]
    public async Task NonScalarArrayResolver_ReadsTheListOutOfTheParentDictionary()
    {
        var row = new Dictionary<string, object>
        {
            ["Addresses"] = new List<object>
            {
                new Dictionary<string, object> { ["City"] = "Paris" },
                new Dictionary<string, object> { ["City"] = "Berlin" }
            }
        };
        var schema = BuildSchema(row, Field("Addresses", "Address", isArray: true));

        var result = await ExecuteAsync(schema, "{ row { Addresses { City } } }");

        result.Errors.Should().BeNullOrEmpty();
        var addresses = (IReadOnlyList<object?>)
            ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Addresses"]!;
        addresses.Should().HaveCount(2);
    }

    [Fact]
    public async Task NonScalarArrayResolver_ReturnsNullWhenTheParentIsNotADictionary()
    {
        var schema = BuildSchema("not a dictionary", Field("Addresses", "Address", isArray: true));

        var result = await ExecuteAsync(schema, "{ row { Addresses { City } } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Addresses"].Should().BeNull();
    }

    [Fact]
    public async Task NonScalarResolver_ReadsTheNestedDictionary()
    {
        var row = new Dictionary<string, object>
        {
            ["Home"] = new Dictionary<string, object> { ["City"] = "Paris" }
        };
        var schema = BuildSchema(row, Field("Home", "Address"));

        var result = await ExecuteAsync(schema, "{ row { Home { City } } }");

        result.Errors.Should().BeNullOrEmpty();
        var home = (IReadOnlyDictionary<string, object?>)
            ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Home"]!;
        home["City"].Should().Be("Paris");
    }

    [Fact]
    public async Task NonScalarResolver_ReturnsNullWhenTheKeyIsAbsent()
    {
        var schema = BuildSchema(new Dictionary<string, object>(), Field("Home", "Address"));

        var result = await ExecuteAsync(schema, "{ row { Home { City } } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Home"].Should().BeNull();
    }

    [Fact]
    public async Task NonScalarResolver_SurfacesAnErrorWhenTheParentIsNotADictionary()
    {
        // Pinned behaviour, and it is asymmetric with the scalar and array branches: the single
        // non-scalar branch casts the parent instead of pattern matching, so a non-dictionary row
        // fails the field rather than resolving null. Fixing that has to update this test.
        var schema = BuildSchema("not a dictionary", Field("Home", "Address"));

        var result = await ExecuteAsync(schema, "{ row { Home { City } } }");

        result.Errors.Should().NotBeNullOrEmpty();
    }

    // ---------------- ResolveCustomObjectTypeField ----------------

    [Fact]
    public async Task CustomObjectTypeField_ResolvesAnArrayFieldFromTheParentDictionary()
    {
        var row = new Dictionary<string, object>
        {
            ["Lines"] = new List<object> { "line 1", "line 2" }
        };
        var schema = SchemaBuilder.New()
            .AddQueryType(descriptor => descriptor
                .Name("Query")
                .Field("row")
                .Type(new NamedTypeNode("Address"))
                .Resolve(_ => row))
            .AddType(new ObjectType(descriptor =>
            {
                descriptor.Name("Address");
                descriptor.ResolveCustomObjectTypeField(Field("Lines", "String", isArray: true));
            }))
            .Create();

        schema.GetType<ObjectType>("Address").Fields["Lines"].Type.Print().Should().Be("[String]");

        var result = await ExecuteAsync(schema, "{ row { Lines } }");
        result.Errors.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task CustomObjectTypeField_ReturnsNullForAnArrayFieldWhenTheParentIsNotADictionary()
    {
        var schema = SchemaBuilder.New()
            .AddQueryType(descriptor => descriptor
                .Name("Query")
                .Field("row")
                .Type(new NamedTypeNode("Address"))
                .Resolve(_ => "not a dictionary"))
            .AddType(new ObjectType(descriptor =>
            {
                descriptor.Name("Address");
                descriptor.ResolveCustomObjectTypeField(Field("Lines", "String", isArray: true));
            }))
            .Create();

        var result = await ExecuteAsync(schema, "{ row { Lines } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["Lines"].Should().BeNull();
    }

    [Fact]
    public async Task CustomObjectTypeField_ResolvesANonArrayFieldFromTheParentDictionary()
    {
        var row = new Dictionary<string, object> { ["City"] = "Paris" };
        var schema = SchemaBuilder.New()
            .AddQueryType(descriptor => descriptor
                .Name("Query")
                .Field("row")
                .Type(new NamedTypeNode("Address"))
                .Resolve(_ => row))
            .AddType(new ObjectType(descriptor =>
            {
                descriptor.Name("Address");
                descriptor.ResolveCustomObjectTypeField(Field("City", "String"));
            }))
            .Create();

        var result = await ExecuteAsync(schema, "{ row { City } }");

        result.Errors.Should().BeNullOrEmpty();
        ((IReadOnlyDictionary<string, object?>)result.Data!["row"]!)["City"].Should().Be("Paris");
    }

    // ---------------- ResolveInputTypeDescriptor ----------------

    private static ISchema BuildInputSchema(params FieldDefinitionResponse[] fields)
    {
        return SchemaBuilder.New()
            .AddQueryType(descriptor => descriptor
                .Name("Query")
                .Field("noop")
                .Argument("input", argument => argument.Type(new NamedTypeNode("PersonInput")))
                .Type(new NamedTypeNode("String"))
                .Resolve(_ => "ok"))
            .AddType(new InputObjectType(descriptor =>
            {
                descriptor.Name("PersonInput");
                foreach (var field in fields)
                {
                    descriptor.ResolveInputTypeDescriptor(field);
                }
            }))
            .AddType(new InputObjectType(descriptor =>
            {
                descriptor.Name("AddressInput");
                descriptor.Field("City").Type(new NamedTypeNode("String"));
            }))
            .Create();
    }

    [Fact]
    public void InputTypeDescriptor_MapsScalarsAndScalarArrays()
    {
        var schema = BuildInputSchema(
            Field("Name", "String", description: "the person name"),
            Field("Tags", "String", isArray: true));

        var input = schema.GetType<InputObjectType>("PersonInput");
        input.Fields["Name"].Type.Print().Should().Be("String");
        input.Fields["Name"].Description.Should().Be("the person name");
        input.Fields["Tags"].Type.Print().Should().Be("[String]");
    }

    [Fact]
    public void InputTypeDescriptor_SuffixesANonScalarTypeWithInput()
    {
        var schema = BuildInputSchema(Field("Home", "Address"));

        schema.GetType<InputObjectType>("PersonInput").Fields["Home"].Type.Print()
            .Should().Be("AddressInput");
    }

    [Fact]
    public void InputTypeDescriptor_WrapsANonScalarArrayInAListOfTheInputType()
    {
        var schema = BuildInputSchema(Field("Addresses", "Address", isArray: true));

        schema.GetType<InputObjectType>("PersonInput").Fields["Addresses"].Type.Print()
            .Should().Be("[AddressInput]");
    }
}
