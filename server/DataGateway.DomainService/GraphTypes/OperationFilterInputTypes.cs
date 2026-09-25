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

/// <summary>
/// Reusable GraphQL input for GeoJson field filters: eq, neq, near, within, intersects.
///
/// The geospatial operators need the field's 2dsphere index, which
/// SchemaDefinitionService creates automatically when the field is declared.
/// </summary>
public class GeoJsonOperationFilterInputType : InputObjectType<GeoJsonOperationFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<GeoJsonOperationFilterInput> descriptor)
    {
        descriptor.Name("GeoJsonOperationFilterInput");
        descriptor.Field(f => f.Eq).Type<GeoJsonType>().Description("Structurally equals.");
        descriptor.Field(f => f.Neq).Type<GeoJsonType>().Description("Does not structurally equal.");
        descriptor.Field(f => f.Near).Type<GeoJsonNearInputType>()
            .Description("Within a distance (meters) of a reference Point.");
        descriptor.Field(f => f.Within).Type<GeoJsonGeometryFilterInputType>()
            .Description("Entirely contained by a reference Polygon or MultiPolygon.");
        descriptor.Field(f => f.Intersects).Type<GeoJsonGeometryFilterInputType>()
            .Description("Overlaps a reference geometry of any type.");
    }
}

/// <summary>Input for the GeoJson <c>near</c> operator.</summary>
public class GeoJsonNearInputType : InputObjectType<GeoJsonNearInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<GeoJsonNearInput> descriptor)
    {
        descriptor.Name("GeoJsonNearInput");
        descriptor.Field(f => f.Geometry).Type<NonNullType<GeoJsonType>>()
            .Description("Reference GeoJSON Point.");
        descriptor.Field(f => f.MaxDistanceMeters).Type<NonNullType<FloatType>>()
            .Description("Maximum distance from the reference point, in meters. Must be positive.");
        descriptor.Field(f => f.MinDistanceMeters).Type<FloatType>()
            .Description("Minimum distance from the reference point, in meters. Must be positive and less than maxDistanceMeters.");
    }
}

/// <summary>Input for the GeoJson <c>within</c> and <c>intersects</c> operators.</summary>
public class GeoJsonGeometryFilterInputType : InputObjectType<GeoJsonGeometryFilterInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<GeoJsonGeometryFilterInput> descriptor)
    {
        descriptor.Name("GeoJsonGeometryFilterInput");
        descriptor.Field(f => f.Geometry).Type<NonNullType<GeoJsonType>>()
            .Description("Reference GeoJSON geometry. `within` accepts only Polygon or MultiPolygon.");
    }
}
