using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;

namespace DataGateway.DomainService.Schemas;

/// <summary>
/// Reads a tenant's schema source and assembles it into the shape the gateway builds from, with no
/// GraphQL involved: a publish validates it and the gateway builds its types from it.
/// </summary>
public sealed class SchemaAssembler(IDbRepository repository)
{
    private readonly IDbRepository _repository = repository;

    /// <summary>
    /// Reads what the tenant's schema is built from, as currently edited (the drafts): every
    /// schema definition with fields, and every validation and access policy.
    /// </summary>
    public async Task<SchemaSource> ReadDraftSourceAsync(string tenantId)
    {
        // System entities (platform services' own collections, seeded so DataAccessPolicys can apply to them)
        // get no GraphQL type, so they never reach the build or a published snapshot.
        var filter = new BsonDocument
        {
            { nameof(SchemaDefinition.IsDeleted), false },
            { nameof(SchemaDefinition.IsSystemEntity), new BsonDocument("$ne", true) },
            { nameof(SchemaDefinition.Fields), new BsonDocument
            {
                { "$ne", BsonNull.Value },
                { "$not", new BsonDocument("$size", 0) }
            }
            }
        };

        // A limit of 0 reads every document: large tenants have hundreds of schemas.
        var data = await _repository.GetItemsAsync<SchemaDefinition>(filter, null, null, 0, 0, tenantId);
        if (data is null || data.Count == 0)
        {
            return new SchemaSource();
        }

        var validations = await _repository.GetItemsAsync<DataValidation>(
            new BsonDocument { { nameof(DataValidation.IsDeleted), false } },
            null,
            null, 0, 0, tenantId);

        var allPolicies = await _repository.GetItemsAsync<DataAccessPolicy>(
            new BsonDocument { { nameof(DataAccessPolicy.IsDeleted), false } },
            null,
            null, 0, 0, tenantId);

        // A system entity has no GraphQL type, so its policies stay out of the source too.
        var systemSchemas = await _repository.GetItemsAsync<SchemaDefinition>(
            new BsonDocument(nameof(SchemaDefinition.IsSystemEntity), true),
            null,
            null, 0, 0, tenantId);
        var systemSchemaIds = (systemSchemas ?? []).Select(s => s.ItemId).ToHashSet();
        var policies = allPolicies?.Where(p => !systemSchemaIds.Contains(p.SchemaId)).ToList();

        return new SchemaSource
        {
            SchemaDefinitions = data,
            DataValidations = validations ?? [],
            DataAccessPolicies = policies ?? [],
            SystemEntitySchemas = SystemTargetsOf(data, validations ?? [], systemSchemas ?? [])
        };
    }

    /// <summary>
    /// The system entities the tenant's own rules point at, from the system schemas already read above: no extra query,
    /// and nothing at all when no rule points at one.
    /// </summary>
    private static List<SchemaDefinition> SystemTargetsOf(List<SchemaDefinition> tenantSchemas, List<DataValidation> validations, List<SchemaDefinition> systemSchemas)
    {
        var tenantIds = tenantSchemas.Select(s => s.ItemId).ToHashSet(StringComparer.Ordinal);
        // Only a tenant Entity of the same name takes the target's place, as in ReferenceTargets.Build.
        var tenantNames = tenantSchemas.Where(s => s.SchemaType == SchemaType.Entity).Select(s => s.SchemaName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var targetNames = validations
            .Where(v => tenantIds.Contains(v.SchemaId))
            .SelectMany(v => v.Validations ?? [])
            .Where(r => r.IsActive && ReferenceTargets.IsLookupRule(r))
            .Select(ReferenceTargets.TargetSchemaName)
            .Where(name => !tenantNames.Contains(name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (targetNames.Count == 0)
            return [];

        return systemSchemas
            .Where(s => !s.IsDeleted && s.SchemaType == SchemaType.Entity && targetNames.Contains(s.SchemaName))
            .ToList();
    }

    /// <summary>
    /// A system entity as a reference target: its name, collection and properties, with no rules of its own. Its
    /// nested properties are stored as dotted rows ("MfaMethods.Active"), which a filter may name.
    /// </summary>
    public static SchemaDefinitionExtended SystemTarget(SchemaDefinition schema) => new()
    {
        ItemId = schema.ItemId,
        SchemaName = schema.SchemaName,
        SchemaType = schema.SchemaType,
        CollectionName = schema.CollectionName,
        IsSystemEntity = true,
        Fields = schema.Fields
            .Select(f => new FieldDefinitionResponse { Name = f.Name, Type = f.Type, IsArray = f.IsArray, EnumValues = f.EnumValues ?? [] })
            .ToList(),
    };

    /// <summary>
    /// Turns the stored definitions into the shape the GraphQL types are built from: fields with
    /// their validations, and policies with field-level inheritance applied. Modifies
    /// <paramref name="source"/>'s definitions (legacy reference-field repair).
    /// </summary>
    public static List<SchemaDefinitionExtended> Assemble(SchemaSource source)
    {
        var data = source.SchemaDefinitions;
        if (data.Count == 0)
        {
            return [];
        }

        // Legacy imports may contain flattened reference fields without the containing
        // DTO type. Recover it in memory so GraphQL can build correctly even before
        // those records are repaired by a subsequent import.
        RestoreMissingReferenceFieldTypes(data);

        var validations = source.DataValidations;

        var schemaDefinitions = data.Select(s => new SchemaDefinitionExtended
        {
            ItemId = s.ItemId,
            IsDeleted = s.IsDeleted,
            SchemaName = s.SchemaName,
            Description = s.Description,
            SchemaType = s.SchemaType,
            ProjectKey = s.ProjectKey,
            ProjectShortKey = s.ProjectShortKey,
            ReadAccessLevel = s.ReadAccessLevel,
            WriteAccessLevel = s.WriteAccessLevel,
            EditAccessLevel = s.EditAccessLevel,
            DeleteAccessLevel = s.DeleteAccessLevel,
            Fields = s.Fields.Where(f => !f.IsReferenceField).Select(f => new FieldDefinitionResponse
            {
                Name = f.Name,
                Type = f.Type,
                IsArray = f.IsArray,
                EnumValues = f.EnumValues ?? [],
                IsPIIData = f.IsPIIData,
                IsUniqueData = f.IsUniqueData,
                RequiredOn = f.RequiredOn,
                Description = f.Description,
                ValidationRule = validations.FirstOrDefault(v => v.SchemaId == s.ItemId && v.FieldName == f.Name) ?? null,
                ReadAccessLevel = f.ReadAccessLevel,
                WriteAccessLevel = f.WriteAccessLevel,
                EditAccessLevel = f.EditAccessLevel,
                DeleteAccessLevel = f.DeleteAccessLevel,
            }).ToList(),
            CollectionName = s.CollectionName,
            Policies = []
        }).ToList();

        var policies = source.DataAccessPolicies;


        // Populate NestedFields for non-scalar fields from referenced schema definitions
        foreach (var schema in schemaDefinitions)
        {
            var fieldDefinitions = data.Where(d => d.ItemId == schema.ItemId).SelectMany(d => d.Fields).ToList();
            var schemaPolicies = policies.Where(p => p.SchemaId == schema.ItemId).ToList();
            var schemaValidations = validations.Where(v => v.SchemaId == schema.ItemId).ToList();
            schema.Fields = SchemaDefinitionMapping.GetFieldDefinitionResponses(fieldDefinitions, schemaPolicies, schemaValidations);
            schema.Policies = schemaPolicies;
            var rlsSchemaPolicies = schemaPolicies.Where(p => p.PolicyType == PolicyType.RLS);
            SchemaPolicyDerivation.SetFieldsPolicies(schema, schema.Fields, rlsSchemaPolicies, schema.ItemId, string.Empty,
                AccessPrincipal.From(BlocksContext.GetContext(), isRootTenant: false));
            SchemaPolicyDerivation.CleanupClsPoliciesBaseOnSchemaAccessLevel(schema);
        }

        return schemaDefinitions;
    }

    public static void RestoreMissingReferenceFieldTypes(List<SchemaDefinition> schemas)
    {
        var schemasByName = schemas
            .Where(schema => !string.IsNullOrWhiteSpace(schema.SchemaName))
            .GroupBy(schema => schema.SchemaName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        foreach (var schema in schemas)
        {
            foreach (var field in schema.Fields.Where(field =>
                         field.IsReferenceField && string.IsNullOrWhiteSpace(field.ReferenceFieldType)))
            {
                var pathSegments = field.Name.Split('.');
                var containingSchema = schema;
                var resolved = pathSegments.Length > 1;

                for (var index = 0; index < pathSegments.Length - 1; index++)
                {
                    var reference = containingSchema.Fields.FirstOrDefault(candidate =>
                        !candidate.IsReferenceField &&
                        string.Equals(candidate.Name, pathSegments[index], StringComparison.Ordinal));

                    if (reference is null ||
                        !schemasByName.TryGetValue(reference.Type, out var referencedSchema))
                    {
                        resolved = false;
                        break;
                    }

                    containingSchema = referencedSchema;
                }

                if (resolved)
                    field.ReferenceFieldType = containingSchema.SchemaName;
            }
        }
    }
}
