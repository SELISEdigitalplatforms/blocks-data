using DataGateway.DomainService.Entities;
using DataGateway.DomainService.GraphTypes;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;

namespace DataGateway.DomainService;

public class GraphqlSchemaBuilder
{
    private readonly IDbRepository _repository;
    private readonly SchemaResolver _schemaResolver;
    private readonly ILogger<GraphqlSchemaBuilder> _logger;

    public GraphqlSchemaBuilder(SchemaResolver schemaResolver, IDbRepository repository, ILogger<GraphqlSchemaBuilder> logger)
    {
        _schemaResolver = schemaResolver;
        _repository = repository;
        _logger = logger;
    }

    public async Task BuildSchema(string tenantId, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Building GraphQL schema for tenant: {TenantId}", tenantId);
            var schemas = await LoadSchemaDefinitions(tenantId);
            if (schemas is null || schemas.Count == 0)
            {
                _logger.LogInformation("Default health check query types created for tenant: {TenantId}", tenantId);
                return;
            }

            if (schemas.Count > 1)
            {
                schemas = schemas.DistinctBy(x => x.SchemaName).ToList();
            }

            _logger.LogInformation("Loaded {Count} schema definitions for tenant: {TenantId}", schemas.Count, tenantId);
            var dbSchemas = schemas.Where(x => x.SchemaType == SchemaType.Entity).ToArray();
            var customSchemas = schemas.Where(x => x.SchemaType == SchemaType.Dto).ToArray();
            var dbSchemaTypes = schemas.ToDictionary(s => s.GetSchemaNameForProject(), s => s);

            var outputTypes = schemas.ToDictionary(
                s => s.GetSchemaNameForProject(),
                s => new QueryOutputType(s, dbSchemaTypes));

            var insertInputTypes = schemas.ToDictionary(
                s => s.GetSchemaNameForProject(),
                s => new InsertInputType(s, dbSchemaTypes));

            var updateInputTypes = schemas.ToDictionary(
                s => s.GetSchemaNameForProject(),
                s => new UpdateInputType(s, dbSchemaTypes));

            var deleteInputTypes = schemas.ToDictionary(
                s => s.GetSchemaNameForProject(),
                s => new DeleteInputType(s));

            var entityFilterInputTypes = dbSchemas.ToDictionary(
                s => s.GetSchemaNameForProject(),
                s => new EntityFilterInputType(s));

            var childFilterInputTypes = BuildChildFilterInputTypes(dbSchemas, customSchemas);

            BuildOnlySchemaType(schemaBuilder, customSchemas);
            BuildFilterAndSortTypes(schemaBuilder, entityFilterInputTypes, childFilterInputTypes);

            var queryType = BuildQueryType(dbSchemas, outputTypes, entityFilterInputTypes);
            var mutationType = BuildMutationType(dbSchemas, insertInputTypes, updateInputTypes, deleteInputTypes, entityFilterInputTypes);

            schemaBuilder.AddQueryType(queryType);
            schemaBuilder.AddMutationType(mutationType);

            _logger.LogInformation("GraphQL schema built for tenant: {TenantId}", tenantId);
            await AdaptSchemaChangeLogsToServerAsync();
            _logger.LogInformation("Schema change logs adapted to server successfully");
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("SCHEMA_FILTER_CYCLE", StringComparison.Ordinal))
        {
            _logger.LogError(ex, "Rejected cyclic GraphQL filter schema for tenant: {TenantId}", tenantId);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred while building GraphQL schema for tenant: {TenantId}, message: {Message}", tenantId, ex.Message);
        }

    }

    private async Task<List<SchemaDefinitionExtended>> LoadSchemaDefinitions(string tenantId)
    {

        var filter = new BsonDocument
        {
            { nameof(SchemaDefinition.IsDeleted), false },
            { nameof(SchemaDefinition.Fields), new BsonDocument
            {
                { "$ne", BsonNull.Value },
                { "$not", new BsonDocument("$size", 0) }
            }
            }
        };


        var data = await _repository.GetItemsAsync<SchemaDefinition>(
            filter,
            null,
            null, 0, 1000, tenantId);
        if (data is null || data.Count == 0)
        {
            return [];
        }

        // Legacy imports may contain flattened reference fields without the containing
        // DTO type. Recover it in memory so GraphQL can build correctly even before
        // those records are repaired by a subsequent import.
        RestoreMissingReferenceFieldTypes(data);

        var validations = await _repository.GetItemsAsync<DataValidation>(
            new BsonDocument { { nameof(DataValidation.IsDeleted), false } },
            null,
            null, 0, 1000, tenantId);

        var schemaDefinitions = data.Select(s => new SchemaDefinitionExtended
        {
            ItemId = s.ItemId,
            IsDeleted = s.IsDeleted,
            SchemaName = s.SchemaName,
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

        var policyFilter = new BsonDocument
            {
                { nameof(DataAccessPolicy.IsDeleted), false }
            };

        var policies = await _repository.GetItemsAsync<DataAccessPolicy>(
            policyFilter,
            null,
            null, 0, 1000, tenantId);


        // Populate NestedFields for non-scalar fields from referenced schema definitions
        foreach (var schema in schemaDefinitions)
        {
            var fieldDefinitions = data.Where(d => d.ItemId == schema.ItemId).SelectMany(d => d.Fields).ToList();
            var schemaPolicies = policies.Where(p => p.SchemaId == schema.ItemId).ToList();
            var schemaValidations = validations.Where(v => v.SchemaId == schema.ItemId).ToList();
            schema.Fields = SchemaDefinitionMapping.GetFieldDefinitionResponses(fieldDefinitions, schemaPolicies, schemaValidations);
            schema.Policies = schemaPolicies;
            var rlsSchemaPolicies = schemaPolicies.Where(p => p.PolicyType == PolicyType.RLS);
            SetFieldsPolicies(schema, schema.Fields, rlsSchemaPolicies, schema.ItemId, string.Empty);
            CleanupClsPoliciesBaseOnSchemaAccessLevel(schema);
        }

        return schemaDefinitions;
    }

    internal static void RestoreMissingReferenceFieldTypes(List<SchemaDefinition> schemas)
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

    private void SetFieldsPolicies(SchemaDefinitionExtended schema, List<FieldDefinitionResponse> fields, IEnumerable<DataAccessPolicy> rlsSchemaPolicies, string schemaId, string parentFieldName)
    {
        foreach (var field in fields)
        {
            var fullPath = string.IsNullOrEmpty(parentFieldName) ? field.Name : parentFieldName + "." + field.Name;
            if (!GraphQlTypeHelper.IsScalar(field.Type))
            {
                SetFieldsPolicies(schema, field.Fields, rlsSchemaPolicies, schemaId, fullPath);
                continue;
            }
            if (field.ReadAccessLevel == SchemaAccessLevel.Inherited)
            {
                var rlsForRead = rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.READ || p.Operation == PolicyOperation.ALL);
                AddInheritedClsPoliciesToSchema(schema, rlsForRead, fullPath, PolicyOperation.READ);
            }
            if (field.WriteAccessLevel == SchemaAccessLevel.Inherited)
            {
                var rlsForWrite = rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.WRITE || p.Operation == PolicyOperation.ALL);
                AddInheritedClsPoliciesToSchema(schema, rlsForWrite, fullPath, PolicyOperation.WRITE);
            }
            if (field.EditAccessLevel == SchemaAccessLevel.Inherited)
            {
                var rlsForEdit = rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.EDIT || p.Operation == PolicyOperation.ALL);
                AddInheritedClsPoliciesToSchema(schema, rlsForEdit, fullPath, PolicyOperation.EDIT);
            }
            if (field.DeleteAccessLevel == SchemaAccessLevel.Inherited)
            {
                var rlsForDelete = rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.DELETE || p.Operation == PolicyOperation.ALL);
                AddInheritedClsPoliciesToSchema(schema, rlsForDelete, fullPath, PolicyOperation.DELETE);
            }
        }
    }

    private void SetFieldValidationRules(List<FieldDefinitionResponse> fields, List<DataValidation> validations, string schemaId, string parentFieldName)
    {
        var parentFieldPath = string.IsNullOrEmpty(parentFieldName) ? string.Empty : $"{parentFieldName}.";
        foreach (var field in fields)
        {
            var propertyName = $"{parentFieldPath}{field.Name}";
            if (GraphQlTypeHelper.IsScalar(field.Type))
            {
                var validation = validations.FirstOrDefault(v => v.SchemaId == schemaId && v.FieldName == propertyName) ?? null;
                if (validation is not null)
                {
                    field.ValidationRule = validation;
                }
            }
            else
            {
                SetFieldValidationRules(field.Fields, validations, schemaId, propertyName);
            }
        }
    }

    private static void CleanupClsPoliciesBaseOnSchemaAccessLevel(SchemaDefinitionExtended schema)
    {
        var clsPolicies = schema.Policies.Where(p => p.PolicyType == PolicyType.CLS).ToList();
        foreach (var policy in clsPolicies)
        {
            foreach (var fieldPath in policy.FieldNames)
            {
                var fieldDef = MutationInputHelper.GetFieldDefForPath(schema, fieldPath);
                if (fieldDef == null) continue;

                var effectiveRead = fieldDef.ReadAccessLevel == SchemaAccessLevel.Inherited ? schema.ReadAccessLevel : fieldDef.ReadAccessLevel;
                var effectiveWrite = fieldDef.WriteAccessLevel == SchemaAccessLevel.Inherited ? schema.WriteAccessLevel : fieldDef.WriteAccessLevel;
                var effectiveEdit = fieldDef.EditAccessLevel == SchemaAccessLevel.Inherited ? schema.EditAccessLevel : fieldDef.EditAccessLevel;
                var effectiveDelete = fieldDef.DeleteAccessLevel == SchemaAccessLevel.Inherited ? schema.DeleteAccessLevel : fieldDef.DeleteAccessLevel;

                if (policy.Operation == PolicyOperation.READ && IgnoreClsPolicy(schema.ReadAccessLevel, effectiveRead))
                {
                    RemoveClsPolicy(schema, policy, fieldPath);
                }
                else if (policy.Operation == PolicyOperation.WRITE && IgnoreClsPolicy(schema.WriteAccessLevel, effectiveWrite))
                {
                    RemoveClsPolicy(schema, policy, fieldPath);
                }
                else if (policy.Operation == PolicyOperation.EDIT && IgnoreClsPolicy(schema.EditAccessLevel, effectiveEdit))
                {
                    RemoveClsPolicy(schema, policy, fieldPath);
                }
                else if (policy.Operation == PolicyOperation.DELETE && IgnoreClsPolicy(schema.DeleteAccessLevel, effectiveDelete))
                {
                    RemoveClsPolicy(schema, policy, fieldPath);
                }
            }
        }
    }
    private static bool IgnoreClsPolicy(SchemaAccessLevel schemaAccessLevel, SchemaAccessLevel fieldAccessLevel)
    {
        if (fieldAccessLevel == SchemaAccessLevel.Public || fieldAccessLevel == SchemaAccessLevel.User)
        {
            return true;
        }
        if (fieldAccessLevel == SchemaAccessLevel.Inherited && schemaAccessLevel != SchemaAccessLevel.Custom)
        {
            return true;
        }
        return false;
    }

    private static void RemoveClsPolicy(SchemaDefinitionExtended schema, DataAccessPolicy clsPolicy, string fieldName)
    {
        if (clsPolicy.FieldNames.Length > 1)
        {
            var policy = schema.Policies.FirstOrDefault(p => p.ItemId == clsPolicy.ItemId);
            if (policy is null)
            {
                return;
            }
            policy.FieldNames = policy.FieldNames.Where(f => f != fieldName).ToArray();
        }
        else
        {
            schema.Policies.RemoveAll(p => p.ItemId == clsPolicy.ItemId);
        }
    }

    private static void AddInheritedClsPoliciesToSchema(SchemaDefinitionExtended schema,
        IEnumerable<DataAccessPolicy> rlsSchemaPolicies,
        string fieldPath,
        PolicyOperation operation)
    {
        if (operation == PolicyOperation.READ && (schema.ReadAccessLevel == SchemaAccessLevel.Public || schema.ReadAccessLevel == SchemaAccessLevel.User))
        { return; }
        if (operation == PolicyOperation.WRITE && (schema.WriteAccessLevel == SchemaAccessLevel.Public || schema.WriteAccessLevel == SchemaAccessLevel.User))
        { return; }
        if (operation == PolicyOperation.EDIT && (schema.EditAccessLevel == SchemaAccessLevel.Public || schema.EditAccessLevel == SchemaAccessLevel.User))
        { return; }
        if (operation == PolicyOperation.DELETE && (schema.DeleteAccessLevel == SchemaAccessLevel.Public || schema.DeleteAccessLevel == SchemaAccessLevel.User))
        { return; }
        var clsPolicies = rlsSchemaPolicies.Select(p => p.Clone()).ToList();
        clsPolicies.ForEach(p =>
        {
            p.FieldNames = [fieldPath];
            p.Operation = operation;
            p.PolicyType = PolicyType.CLS;
            p.InjectDefaultValue();
        });
        schema.Policies.RemoveAll(p => p.SchemaId == schema.ItemId && p.PolicyType == PolicyType.CLS && p.Operation == operation && p.FieldNames.Contains(fieldPath));
        schema.Policies.AddRange(clsPolicies);
    }

    private async Task AdaptSchemaChangeLogsToServerAsync()
    {
        try
        {
            _logger.LogInformation("Adapting schema change logs to server");
            var filter = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), false);
            var update = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), true);
            var result = await _repository.UpdateManyAsync($"{nameof(SchemaChangeLog)}s", filter, update);
            _logger.LogInformation("Adapted {ModifiedCount} schema change logs to server", result.TotalImpactedData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred while adopting schema change log to server");
        }
    }



    private static void BuildFilterAndSortTypes(
        ISchemaBuilder schemaBuilder,
        Dictionary<string, EntityFilterInputType> entityFilterInputTypes,
        IReadOnlyCollection<ChildSchemaFilterInputType> childFilterInputTypes)
    {
        schemaBuilder.AddType<SortDirectionType>();
        schemaBuilder.AddType<DynamicSortInputType>();
        schemaBuilder.AddType<QueryInputType>();
        schemaBuilder.AddType<PaginationInputType>();
        schemaBuilder.AddType<StringOperationFilterInputType>();
        schemaBuilder.AddType<NumberOperationFilterInputType>();
        schemaBuilder.AddType<IntOperationFilterInputType>();
        schemaBuilder.AddType<BooleanOperationFilterInputType>();
        schemaBuilder.AddType<DateTimeOperationFilterInputType>();
        foreach (var type in entityFilterInputTypes.Values)
            schemaBuilder.AddType(type);
        foreach (var type in childFilterInputTypes)
            schemaBuilder.AddType(type);
    }

    private static IReadOnlyCollection<ChildSchemaFilterInputType> BuildChildFilterInputTypes(
        IEnumerable<SchemaDefinitionExtended> entitySchemas,
        IEnumerable<SchemaDefinitionExtended> customSchemas)
    {
        var schemasByName = customSchemas
            .GroupBy(schema => schema.SchemaName, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        var definitions = new Dictionary<string, IReadOnlyList<FieldDefinitionResponse>>(StringComparer.Ordinal);

        foreach (var entitySchema in entitySchemas)
        {
            foreach (var field in entitySchema.Fields.Where(field => !GraphQlTypeHelper.IsScalar(field.Type)))
            {
                if (schemasByName.TryGetValue(field.Type, out var childSchema))
                {
                    BuildCanonicalFields(
                        childSchema,
                        new HashSet<string>(StringComparer.Ordinal),
                        $"{entitySchema.SchemaName}.{field.Name}");
                }
            }
        }

        return definitions.Select(x => new ChildSchemaFilterInputType(x.Key, x.Value)).ToArray();

        IReadOnlyList<FieldDefinitionResponse> BuildCanonicalFields(
            SchemaDefinitionExtended schema,
            HashSet<string> ancestors,
            string path)
        {
            if (definitions.TryGetValue(schema.SchemaName, out var existing))
                return existing;

            if (!ancestors.Add(schema.SchemaName))
                throw new InvalidOperationException($"SCHEMA_FILTER_CYCLE: cyclic child schema reference at '{path}'.");

            var fields = new List<FieldDefinitionResponse>();
            foreach (var field in schema.Fields)
            {
                var canonicalField = new FieldDefinitionResponse
                {
                    Name = field.Name,
                    Type = field.Type
                };

                if (!GraphQlTypeHelper.IsScalar(field.Type) &&
                    schemasByName.TryGetValue(field.Type, out var childSchema))
                {
                    canonicalField.Fields = BuildCanonicalFields(
                        childSchema, ancestors, $"{path}.{field.Name}").ToList();
                }

                fields.Add(canonicalField);
            }

            ancestors.Remove(schema.SchemaName);
            definitions.Add(schema.SchemaName, fields);
            return fields;
        }
    }

    private ObjectType BuildQueryType(
        IList<SchemaDefinitionExtended> schemas,
        Dictionary<string, QueryOutputType> dynamicTypes,
        Dictionary<string, EntityFilterInputType> entityFilterInputTypes)
    {
        return new ObjectType(descriptor =>
        {
            descriptor.Name("Query");

            foreach (var schema in schemas)
            {
                if (schema.SchemaType == SchemaType.Dto)
                    continue;
                var schemaName = schema.GetSchemaNameForProject();
                _schemaResolver.ResolveQuerySchema(descriptor, schema, dynamicTypes, entityFilterInputTypes[schemaName]);
            }
        });
    }

    private ObjectType BuildMutationType(
        IList<SchemaDefinitionExtended> schemas,
        Dictionary<string, InsertInputType> insertInputTypes,
        Dictionary<string, UpdateInputType> updateInputTypes,
        Dictionary<string, DeleteInputType> deleteInputTypes,
        Dictionary<string, EntityFilterInputType> entityFilterInputTypes)
    {
        return new ObjectType(descriptor =>
        {
            descriptor.Name("Mutation");

            foreach (var schema in schemas)
            {
                var schemaName = schema.GetSchemaNameForProject();
                _schemaResolver.ResolveInsertSchema(descriptor, schema, insertInputTypes[schemaName]);
                _schemaResolver.ResolveBulkInsertSchema(descriptor, schema, insertInputTypes[schemaName]);
                _schemaResolver.ResolveUpdateSchema(descriptor, schema, updateInputTypes[schemaName], entityFilterInputTypes[schemaName]);
                _schemaResolver.ResolveBulkUpdateSchema(descriptor, schema, updateInputTypes[schemaName], entityFilterInputTypes[schemaName]);
                _schemaResolver.ResolveDeleteSchema(descriptor, schema, deleteInputTypes[schemaName], entityFilterInputTypes[schemaName]);
                _schemaResolver.ResolveBulkDeleteSchema(descriptor, schema, deleteInputTypes[schemaName], entityFilterInputTypes[schemaName]);
            }
        });
    }

    private static void BuildOnlySchemaType(ISchemaBuilder schemaBuilder, IEnumerable<SchemaDefinitionExtended> schemas)
    {
        foreach (var schema in schemas)
        {
            schemaBuilder.AddType(ResolveType(schema));
            schemaBuilder.AddType(ResolveInputType(schema));
        }
    }
    private static InputObjectType ResolveInputType(SchemaDefinitionExtended schemaDefinition)
    {
        var schemaName = schemaDefinition.GetSchemaNameForProject();
        return new InputObjectType(descriptor =>
        {
            descriptor.Name($"{schemaName}Input");
            foreach (var field in schemaDefinition.Fields)
            {
                descriptor.ResolveInputTypeDescriptor(field);
            }
        });
    }
    private static ObjectType ResolveType(SchemaDefinitionExtended schemaDefinition)
    {
        return new ObjectType(descriptor =>
        {
            var schemaName = schemaDefinition.GetSchemaNameForProject();
            descriptor.Name(schemaName);
            foreach (var field in schemaDefinition.Fields)
            {
                descriptor.ResolveObjectTypeDescriptor(field);
            }
        });
    }

}
