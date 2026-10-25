using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis;
using DataGateway.DomainService.GraphTypes;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using Blocks.Genesis.DataAccess.Rules;

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
    /// Returns false when the tenant has no schema definitions, in which case only the empty query
    /// type is added (see <see cref="EmptyQueryFieldName"/>).
    /// </summary>
    public async Task<bool> BuildSchema(string tenantId, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        var source = await ReadDraftSourceAsync(tenantId);
        return BuildSchema(tenantId, source, schemaBuilder);
    }

    /// <summary>
    /// Adds the types built from <paramref name="source"/> (drafts or a published snapshot) to
    /// <paramref name="schemaBuilder"/>. Returns false when the source has no schema definitions,
    /// in which case only the empty query type is added. Without an entity there is no Mutation
    /// type and the Query type holds only <see cref="EmptyQueryFieldName"/>, so the schema still
    /// builds and introspects. The source's definitions may be modified while building.
    /// With <paramref name="strictReferences"/> (a publish), a Reference rule whose target schema or
    /// field is missing fails the build; otherwise it is logged and left unchecked.
    /// </summary>
    public bool BuildSchema(string tenantId, SchemaSource source, ISchemaBuilder schemaBuilder, bool strictReferences = false)
    {
        try
        {
            var schemas = Assemble(source);
            if (schemas.Count == 0)
            {
                _logger.LogDebug("Tenant {TenantId} has no schema definitions; building the empty schema", tenantId);
                schemaBuilder.AddQueryType(BuildEmptyQueryType());
                return false;
            }

            if (schemas.Count > 1)
            {
                schemas = schemas.DistinctBy(x => x.SchemaName).ToList();
            }

            _logger.LogDebug("Building GraphQL types for {Count} schema definitions of tenant {TenantId}", schemas.Count, tenantId);
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
            if (schemas.Any(s => s.Fields.Any(f => OperationAccessType.Serves(f.Name, f.Type, dbSchemaTypes))))
                schemaBuilder.AddType<OperationAccessType>();
            BuildFilterAndSortTypes(schemaBuilder, entityFilterInputTypes, childFilterInputTypes);

            // System entities a rule points at are targets too; a tenant schema of the same name comes first and wins.
            var references = ReferenceTargets.Build([.. schemas, .. source.SystemEntitySchemas.Select(SystemTarget)], strictReferences, _logger);
            CheckVariables(schemas, strictReferences);

            // HotChocolate refuses a Query or Mutation type without fields, and only entities add them.
            if (dbSchemas.Length == 0)
            {
                schemaBuilder.AddQueryType(BuildEmptyQueryType());
            }
            else
            {
                schemaBuilder.AddQueryType(BuildQueryType(dbSchemas, outputTypes, entityFilterInputTypes));
                schemaBuilder.AddMutationType(BuildMutationType(dbSchemas, insertInputTypes, updateInputTypes, deleteInputTypes, entityFilterInputTypes, references));
            }

            _logger.LogDebug("GraphQL types built for tenant {TenantId}", tenantId);
            return true;
        }
        catch (Exception ex)
        {
            // Rethrow so a failed rebuild keeps the executor that is already serving, instead of
            // replacing it with a half-configured schema. The caller logs it once, with what it
            // was building (a publish's test build, or a pod's rebuild of a published version).
            _logger.LogDebug(ex, "Building GraphQL types failed for tenant {TenantId}", tenantId);
            throw;
        }

    }

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
    private static SchemaDefinitionExtended SystemTarget(SchemaDefinition schema) => new()
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

    /// <summary>The only Query field of a tenant without entities. Always null.</summary>
    public const string EmptyQueryFieldName = "_empty";

    /// <summary>
    /// The Query type of a tenant without entities. GraphQL requires a query type with at least one
    /// field, and introspection lives on it, so the playground shows an empty API instead of failing.
    /// </summary>
    private static ObjectType BuildEmptyQueryType()
    {
        return new ObjectType(descriptor =>
        {
            descriptor.Name("Query");
            descriptor.Field(EmptyQueryFieldName)
                .Type<BooleanType>()
                .Description("No entity schemas are published yet. Always null.")
                .Resolve(_ => null);
        });
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

    /// <summary>
    /// Default templates and validation variables name properties of their own schema. One whose property
    /// was renamed or deleted fails a publish (strict) with both names; a pod rebuilding an already
    /// published version only logs it (the template then renders that part empty; the rule is skipped).
    /// </summary>
    private void CheckVariables(IEnumerable<SchemaDefinitionExtended> schemas, bool strict)
    {
        var problems = new List<string>();
        foreach (var schema in schemas.Where(s => s.SchemaType == SchemaType.Entity))
        {
            var fields = VariableSyntax.FieldsOf(schema.Fields);
            foreach (var (path, field) in FlattenFields(schema.Fields, string.Empty))
            {
                if (field.DefaultValue is { Kind: DefaultValueKind.Template } template)
                {
                    var problem = FieldDefaultValueCheck.Check(path, field.Type, field.IsArray, field.EnumValues, template, schema.SchemaName, fields);
                    if (problem is not null)
                        problems.Add($"{schema.SchemaName}.{path} default value: {problem}");
                }
                var ruleField = new RuleField(path, field.Type, field.IsArray, field.EnumValues);
                foreach (var rule in field.ValidationRule?.Validations ?? [])
                {
                    if (rule.IsActive && ValidationVariableCheck.Check(rule, field.Type, schema.SchemaName, fields) is { } problem)
                        problems.Add($"{schema.SchemaName}.{path} {rule.Type} rule: {problem}");
                    // Only rules that use what the validation and access rules plan added get a message here (G12).
                    if (rule.IsActive)
                        problems.AddRange(ValidationRuleCheck.Check(rule, ruleField, schema.SchemaName, schema.IsSystemEntity, fields)
                            .Select(newRuleProblem => $"{schema.SchemaName}.{path} {rule.Type} rule: {newRuleProblem}"));
                }
            }
        }

        if (problems.Count == 0)
            return;
        if (strict)
            throw new InvalidOperationException(string.Join("; ", problems));
        _logger.LogWarning("Variables that no longer resolve: {Problems}", string.Join("; ", problems));
    }

    private static IEnumerable<(string Path, FieldDefinitionResponse Field)> FlattenFields(IEnumerable<FieldDefinitionResponse> fields, string prefix)
    {
        foreach (var field in fields)
        {
            var path = $"{prefix}{field.Name}";
            yield return (path, field);
            foreach (var nested in FlattenFields(field.Fields, $"{path}."))
                yield return nested;
        }
    }

    private ObjectType BuildMutationType(
        IList<SchemaDefinitionExtended> schemas,
        Dictionary<string, InsertInputType> insertInputTypes,
        Dictionary<string, UpdateInputType> updateInputTypes,
        Dictionary<string, DeleteInputType> deleteInputTypes,
        Dictionary<string, EntityFilterInputType> entityFilterInputTypes,
        ReferenceTargets references)
    {
        return new ObjectType(descriptor =>
        {
            descriptor.Name("Mutation");

            foreach (var schema in schemas)
            {
                var schemaName = schema.GetSchemaNameForProject();
                _schemaResolver.ResolveInsertSchema(descriptor, schema, insertInputTypes[schemaName], references);
                _schemaResolver.ResolveBulkInsertSchema(descriptor, schema, insertInputTypes[schemaName], references);
                _schemaResolver.ResolveUpdateSchema(descriptor, schema, updateInputTypes[schemaName], entityFilterInputTypes[schemaName], references);
                _schemaResolver.ResolveBulkUpdateSchema(descriptor, schema, updateInputTypes[schemaName], entityFilterInputTypes[schemaName], references);
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
