using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds MongoDB filter and sort documents for schema definition list queries.
/// </summary>
public static class SchemaDefinitionFilterHelper
{
    /// <summary>Builds filter for GetSchemaDefinitionListRequest (keyword, schema name, collection name, schema type).</summary>
    public static BsonDocument GetFilter(GetSchemaDefinitionListRequest request)
    {
        var filter = new BsonDocument();
        if (!string.IsNullOrWhiteSpace(request.Keyword))
            filter.Add(nameof(SchemaDefinition.SchemaName), new BsonRegularExpression(request.Keyword, "i"));
        else if (!string.IsNullOrWhiteSpace(request.SchemaName))
            filter.Add(nameof(SchemaDefinition.SchemaName), request.SchemaName);
        else if (!string.IsNullOrWhiteSpace(request.CollectionName))
            filter.Add(nameof(SchemaDefinition.CollectionName), request.CollectionName);

        if (request.SchemaType.HasValue)
            filter.Add(nameof(SchemaDefinition.SchemaType), request.SchemaType.Value);
        return filter;
    }

    /// <summary>Builds a $match + $group aggregation pipeline that counts all schemas by access level in one round-trip.</summary>
    public static BsonDocument[] BuildAggregationPipeline()
    {
        var matchFilter = new BsonDocument
        {
            { nameof(SchemaDefinition.SchemaType), (int)SchemaType.Entity }
        };

        static BsonDocument CountWhere(string field, SchemaAccessLevel level) =>
            new("$sum", new BsonDocument("$cond", new BsonArray
            {
                new BsonDocument("$eq", new BsonArray { $"${field}", (int)level }),
                1, 0
            }));

        var groupStage = new BsonDocument
        {
            { "_id", BsonNull.Value },
            { "ReadPublic",   CountWhere(nameof(SchemaDefinition.ReadAccessLevel),   SchemaAccessLevel.Public)  },
            { "ReadUser",     CountWhere(nameof(SchemaDefinition.ReadAccessLevel),   SchemaAccessLevel.User)    },
            { "ReadCustom",   CountWhere(nameof(SchemaDefinition.ReadAccessLevel),   SchemaAccessLevel.Custom)  },
            { "WritePublic",  CountWhere(nameof(SchemaDefinition.WriteAccessLevel),  SchemaAccessLevel.Public)  },
            { "WriteUser",    CountWhere(nameof(SchemaDefinition.WriteAccessLevel),  SchemaAccessLevel.User)    },
            { "WriteCustom",  CountWhere(nameof(SchemaDefinition.WriteAccessLevel),  SchemaAccessLevel.Custom)  },
            { "EditPublic",   CountWhere(nameof(SchemaDefinition.EditAccessLevel),   SchemaAccessLevel.Public)  },
            { "EditUser",     CountWhere(nameof(SchemaDefinition.EditAccessLevel),   SchemaAccessLevel.User)    },
            { "EditCustom",   CountWhere(nameof(SchemaDefinition.EditAccessLevel),   SchemaAccessLevel.Custom)  },
            { "DeletePublic", CountWhere(nameof(SchemaDefinition.DeleteAccessLevel), SchemaAccessLevel.Public)  },
            { "DeleteUser",   CountWhere(nameof(SchemaDefinition.DeleteAccessLevel), SchemaAccessLevel.User)    },
            { "DeleteCustom", CountWhere(nameof(SchemaDefinition.DeleteAccessLevel), SchemaAccessLevel.Custom)  },
        };

        return
        [
            new BsonDocument("$match", matchFilter),
            new BsonDocument("$group", groupStage),
        ];
    }

    /// <summary>Builds sort document (default: CreatedDate descending).</summary>
    public static BsonDocument GetSorting(string sortBy, bool sortDescending)
    {
        if (!string.IsNullOrWhiteSpace(sortBy))
            return new BsonDocument(sortBy, sortDescending ? -1 : 1);
        return new BsonDocument(nameof(SchemaDefinition.CreatedDate), -1);
    }
}
