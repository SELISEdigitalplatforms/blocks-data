using Blocks.DataAccess.Models;
using MongoDB.Bson.Serialization.Attributes;

namespace Blocks.DataAccess.Entities;

[BsonIgnoreExtraElements]
public class SchemaDefinition : GraphQlBaseEntity
{
    public string CollectionName { get; set; } = string.Empty;
    public List<FieldDefinition> Fields { get; set; } = new List<FieldDefinition>();
    public string SchemaName { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public SchemaAccessLevel ReadAccessLevel { get; set; } = SchemaAccessLevel.User;
    public SchemaAccessLevel WriteAccessLevel { get; set; } = SchemaAccessLevel.User;
    public SchemaAccessLevel EditAccessLevel { get; set; } = SchemaAccessLevel.User;
    public SchemaAccessLevel DeleteAccessLevel { get; set; } = SchemaAccessLevel.User;

    public string GetSchemaNameForProject()
    {
        return SchemaName;
    }
}
