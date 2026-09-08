using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Entities;

[BsonIgnoreExtraElements]
public class SchemaIndexDefinition : GraphQlBaseEntity
{
    public string SchemaDefinitionItemId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<IndexFieldSpec> Fields { get; set; } = new List<IndexFieldSpec>();
    public bool IsUnique { get; set; }
}

[BsonIgnoreExtraElements]
public class IndexFieldSpec
{
    public string FieldName { get; set; } = string.Empty;

    /// <summary>
    /// MongoDB sort direction for this key within the index: 1 (ascending) or -1 (descending).
    /// </summary>
    public int Direction { get; set; } = 1;
}
