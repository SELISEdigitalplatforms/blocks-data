using System;
using DataGateway.DomainService.Models;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace DataGateway.DomainService.Entities;

[BsonIgnoreExtraElements(Inherited = true)]
public class FieldDefinition //: FieldAccessInformation
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsArray { get; set; }
    public bool IsPIIData { get; set; }
    public bool IsUniqueData { get; set; }
    [BsonRepresentation(BsonType.String)]
    public RequiredOn RequiredOn { get; set; } = RequiredOn.None;
    public string Description { get; set; } = string.Empty;
    public bool IsReferenceField { get; set; }
    public string ReferenceFieldType { get; set; } = string.Empty;
    public SchemaAccessLevel ReadAccessLevel { get; set; } = SchemaAccessLevel.Inherited;
    public SchemaAccessLevel WriteAccessLevel { get; set; } = SchemaAccessLevel.Inherited;
    public SchemaAccessLevel EditAccessLevel { get; set; } = SchemaAccessLevel.Inherited;
    public SchemaAccessLevel DeleteAccessLevel { get; set; } = SchemaAccessLevel.Inherited;
}
