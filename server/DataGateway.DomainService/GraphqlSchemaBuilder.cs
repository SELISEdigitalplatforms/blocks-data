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

    /// <summary>
    /// Adds the types built from the tenant's current drafts to <paramref name="schemaBuilder"/>.
    /// Returns false when the tenant has no schema definitions, in which case nothing is added.
    /// </summary>
    public async Task<bool> BuildSchema(string tenantId, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        var source = await ReadDraftSourceAsync(tenantId);
        return BuildSchema(tenantId, source, schemaBuilder);
    }

    /// <summary>
    /// Adds the types built from <paramref name="source"/> (drafts or a published snapshot) to
    /// <paramref name="schemaBuilder"/>. Returns false when the source has no schema definitions,
    /// in which case nothing is added. The source's definitions may be modified while building.
    /// </summary>
    public bool BuildSchema(string tenantId, SchemaSource source, ISchemaBuilder schemaBuilder)
    {
        try
        {
            _logger.LogInformation("Building GraphQL schema for tenant: {TenantId}", tenantId);
            var schemas = Assemble(source);
            if (schemas.Count == 0)
            {
                _logger.LogInformation("Default health check query types created for tenant: {TenantId}", tenantId);
                return false;
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

            RegisterEnumFieldTypes(schemaBuilder, schemas);
            BuildOnlySchemaType(schemaBuilder, customSchemas);
            BuildFilterAndSortTypes(schemaBuilder, entityFilterInputTypes, childFilterInputTypes);

            var queryType = BuildQueryType(dbSchemas, outputTypes, entityFilterInputTypes);
            var mutationType = BuildMutationType(dbSchemas, insertInputTypes, updateInputTypes, deleteInputTypes, entityFilterInputTypes);

            schemaBuilder.AddQueryType(queryType);
            schemaBuilder.AddMutationType(mutationType);

            _logger.LogInformation("GraphQL schema built for tenant: {TenantId}", tenantId);
            return true;
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("SCHEMA_FILTER_CYCLE", StringComparison.Ordinal))
        {
            _logger.LogError(ex, "Rejected cyclic GraphQL filter schema for tenant: {TenantId}", tenantId);
            throw;
        }
        catch (Exception ex)
        {
            // Rethrow so a failed rebuild keeps the executor that is already serving, instead of
            // replacing it with a half-configured schema.
            _logger.LogError(ex, "Error occurred while building GraphQL schema for tenant: {TenantId}, message: {Message}", tenantId, ex.Message);
            throw;
        }

    }

    /// <summary>
    /// Reads what the tenant's schema is built from, as currently edited (the drafts): every
    /// schema definition with fields, and every validation and access policy.
    /// </summary>
    public async Task<SchemaSource> ReadDraftSourceAsync(string tenantId)
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

        var policies = await _repository.GetItemsAsync<DataAccessPolicy>(
            new BsonDocument { { nameof(DataAccessPolicy.IsDeleted), false } },
            null,
            null, 0, 0, tenantId);

        return new SchemaSource
        {
            SchemaDefinitions = data,
            DataValidations = validations ?? [],
            DataAccessPolicies = policies ?? []
        };
    }

    /// <summary>
    /// Turns the stored definitions into the shape the GraphQL types are built from: fields with
    /// their validations, and policies with field-level inheritance applied. Modifies
    /// <paramref name="source"/>'s definitions (legacy reference-field repair).
    /// </summary>
    internal static List<SchemaDefinitionExtended> Assemble(SchemaSource source)
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

    private static void SetFieldsPolicies(SchemaDefinitionExtended schema, List<FieldDefinitionResponse> fields, IEnumerable<DataAccessPolicy> rlsSchemaPolicies, string schemaId, string parentFieldName)
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
        // The GeoJson scalar is registered unconditionally, not only when some
        // schema happens to use it: GetTypeNode emits a bare NamedTypeNode, so
        // the type has to exist in the schema before any field can reference it.
        schemaBuilder.AddType<GeoJsonType>();
        schemaBuilder.AddType<GeoJsonOperationFilterInputType>();
        schemaBuilder.AddType<GeoJsonNearInputType>();
        schemaBuilder.AddType<GeoJsonGeometryFilterInputType>();
        foreach (var type in entityFilterInputTypes.Values)
            schemaBuilder.AddType(type);
        foreach (var type in childFilterInputTypes)
            schemaBuilder.AddType(type);

    }

    private static void RegisterEnumFieldTypes(
        ISchemaBuilder schemaBuilder,
        IReadOnlyCollection<SchemaDefinitionExtended> allSchemas)
    {
        // Per-field Enum types + filters (unlike GeoJson's single global scalar).
        // Registered before DTO/output types so NamedTypeNode references resolve.
        var registeredEnumTypeNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (var schema in allSchemas)
        {
            var schemaName = schema.GetSchemaNameForProject();
            foreach (var field in schema.Fields.Where(f => f.Type == GraphQlTypeHelper.EnumTypeName))
            {
                var values = field.EnumValues ?? [];
                if (values.Count == 0)
                    continue;
                var enumTypeName = GraphQlTypeHelper.GetEnumTypeName(schemaName, field.Name);
                if (!registeredEnumTypeNames.Add(enumTypeName))
                    continue;
                schemaBuilder.AddType(new DynamicFieldEnumType(enumTypeName, values));
                schemaBuilder.AddType(new EnumOperationFilterInputType(schemaName, field.Name));
            }
        }
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
                    Type = field.Type,
                    IsArray = field.IsArray,
                    EnumValues = field.EnumValues ?? [],
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
                descriptor.ResolveInputTypeDescriptor(field, schemaName);
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
                descriptor.ResolveObjectTypeDescriptor(field, schemaName);
            }
        });
    }

}
