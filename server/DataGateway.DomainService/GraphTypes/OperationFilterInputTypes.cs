using DataGateway.DomainService.Models;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// Reusable GraphQL input for string field filters: eq, neq, contains, startsWith, endsWith, in.
/// </summary>
public class StringOperationFilterInputType : InputObjectType<StringOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<StringOperationFilterInput> descriptor)
    {
        descriptor.Name("StringOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<StringType>().Description("Equals.");
        descriptor.Field(f => f.Neq).Type<StringType>().Description("Not equals.");
        descriptor.Field(f => f.Contains).Type<StringType>().Description("Contains substring.");
        descriptor.Field(f => f.StartsWith).Type<StringType>().Description("Starts with.");
        descriptor.Field(f => f.EndsWith).Type<StringType>().Description("Ends with.");
        descriptor.Field(f => f.In).Type<ListType<StringType>>().Description("In list.");
    }
}

/// <summary>
/// Reusable GraphQL input for number field filters: eq, neq, gt, gte, lt, lte, in.
/// </summary>
public class NumberOperationFilterInputType : InputObjectType<NumberOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<NumberOperationFilterInput> descriptor)
    {
        descriptor.Name("NumberOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<FloatType>().Description("Equals.");
        descriptor.Field(f => f.Neq).Type<FloatType>().Description("Not equals.");
        descriptor.Field(f => f.Gt).Type<FloatType>().Description("Greater than.");
        descriptor.Field(f => f.Gte).Type<FloatType>().Description("Greater than or equal.");
        descriptor.Field(f => f.Lt).Type<FloatType>().Description("Less than.");
        descriptor.Field(f => f.Lte).Type<FloatType>().Description("Less than or equal.");
        descriptor.Field(f => f.In).Type<ListType<FloatType>>().Description("In list.");
    }
}

/// <summary>
/// Reusable GraphQL input for int field filters (uses Int in GraphQL).
/// </summary>
public class IntOperationFilterInputType : InputObjectType<IntOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<IntOperationFilterInput> descriptor)
    {
        descriptor.Name("IntOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<IntType>().Description("Equals.");
        descriptor.Field(f => f.Neq).Type<IntType>().Description("Not equals.");
        descriptor.Field(f => f.Gt).Type<IntType>().Description("Greater than.");
        descriptor.Field(f => f.Gte).Type<IntType>().Description("Greater than or equal.");
        descriptor.Field(f => f.Lt).Type<IntType>().Description("Less than.");
        descriptor.Field(f => f.Lte).Type<IntType>().Description("Less than or equal.");
        descriptor.Field(f => f.In).Type<ListType<IntType>>().Description("In list.");
    }
}

/// <summary>
/// Reusable GraphQL input for boolean field filters: eq, neq.
/// </summary>
public class BooleanOperationFilterInputType : InputObjectType<BooleanOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<BooleanOperationFilterInput> descriptor)
    {
        descriptor.Name("BooleanOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<BooleanType>().Description("Equals.");
        descriptor.Field(f => f.Neq).Type<BooleanType>().Description("Not equals.");
    }
}

/// <summary>
/// Reusable GraphQL input for DateTime field filters: eq, neq, gt, gte, lt, lte, in.
/// </summary>
public class DateTimeOperationFilterInputType : InputObjectType<DateTimeOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<DateTimeOperationFilterInput> descriptor)
    {
        descriptor.Name("DateTimeOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<DateTimeType>().Description("Equals.");
        descriptor.Field(f => f.Neq).Type<DateTimeType>().Description("Not equals.");
        descriptor.Field(f => f.Gt).Type<DateTimeType>().Description("Greater than.");
        descriptor.Field(f => f.Gte).Type<DateTimeType>().Description("Greater than or equal.");
        descriptor.Field(f => f.Lt).Type<DateTimeType>().Description("Less than.");
        descriptor.Field(f => f.Lte).Type<DateTimeType>().Description("Less than or equal.");
        descriptor.Field(f => f.In).Type<ListType<DateTimeType>>().Description("In list.");
    }
}
