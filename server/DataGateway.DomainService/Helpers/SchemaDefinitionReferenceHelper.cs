using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Handles reference (nested) field resolution and DTO reference mapping for schema definitions.
/// </summary>
public class SchemaDefinitionReferenceHelper
{
    private readonly IDbRepository _repository;
    private readonly ISchemaChangeLogService _schemaChangeLogService;

    public SchemaDefinitionReferenceHelper(IDbRepository repository, ISchemaChangeLogService schemaChangeLogService)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _schemaChangeLogService = schemaChangeLogService ?? throw new ArgumentNullException(nameof(schemaChangeLogService));
    }

    /// <summary>Adds inner (nested) properties of non-scalar fields to schema.Fields.</summary>
    public async Task AddReferenceInnerFieldsToSchemaAsync(SchemaDefinition schema, string referenceSchemaName = "")
    {
        if (schema.SchemaType == SchemaType.Dto) return;

        var innerFields = await GetSchemaDefinitionReferenceFieldsAsync(schema, parentPath: "", referenceSchemaName: referenceSchemaName);
        foreach (var innerField in innerFields)
        {
            var existingField = schema.Fields.FirstOrDefault(f => f.Name == innerField.Name);
            if (existingField is null)
                schema.Fields.Add(innerField);
            else
            {
                existingField.Type = innerField.Type;
                existingField.IsArray = innerField.IsArray;
                existingField.IsPIIData = innerField.IsPIIData;
                existingField.IsUniqueData = innerField.IsUniqueData;
                existingField.Description = innerField.Description;
            }
        }
        var removedFieldNames = schema.Fields
            .Where(f => f.IsReferenceField && !innerFields.Any(i => i.Name == f.Name))
            .Select(f => f.Name)
            .ToList();
        if (!string.IsNullOrWhiteSpace(referenceSchemaName))
            removedFieldNames = removedFieldNames.Where(f => f.StartsWith($"{referenceSchemaName}.", StringComparison.Ordinal)).ToList();
        schema.Fields.RemoveAll(f => removedFieldNames.Contains(f.Name));
    }

    /// <summary>Returns inner (nested) field definitions for non-scalar references, max 3 levels.</summary>
    public async Task<List<FieldDefinition>> GetSchemaDefinitionReferenceFieldsAsync(SchemaDefinition schema, string parentPath = "", int iteration = 0, string referenceSchemaName = "")
    {
        var result = new List<FieldDefinition>();
        var isRoot = string.IsNullOrEmpty(parentPath);
        if (iteration > GraphQlConstant.MaxNestedLevelIterationLimit) return result;

        foreach (var field in schema.Fields)
        {
            if (!string.IsNullOrWhiteSpace(referenceSchemaName) && field.Type != referenceSchemaName) continue;
            var currentPath = isRoot ? field.Name : $"{parentPath}.{field.Name}";

            if (GraphQlTypeHelper.IsScalar(field.Type))
            {
                if (!isRoot)
                    result.Add(CreateReferenceFieldDefinition(field, currentPath, schema.SchemaName));
            }
            else
            {
                var filter = new BsonDocument { { nameof(SchemaDefinition.SchemaName), field.Type } };
                var referencedSchema = await _repository.GetItemAsync<SchemaDefinition>(filter);
                if (referencedSchema != null)
                {
                    var nestedFields = await GetSchemaDefinitionReferenceFieldsAsync(referencedSchema, currentPath, iteration + 1);
                    result.AddRange(nestedFields);
                }
            }
        }
        return result;
    }

    /// <summary>When a DTO schema changes, refreshes inner fields on entity schemas that reference it and persists.</summary>
    public async Task ApplyChangesToReferenceEntityFields(SchemaDefinition schema, HashSet<string>? visitedSchemaNames = null)
    {
        if (schema.SchemaType == SchemaType.Entity) return;
        visitedSchemaNames ??= new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!visitedSchemaNames.Add(schema.SchemaName)) return;

        var filter = new BsonDocument
        {
            { $"{nameof(SchemaDefinition.Fields)}.{nameof(FieldDefinition.Type)}", schema.SchemaName }
        };
        var referencingSchemas = await _repository.GetItemsAsync<SchemaDefinition>(filter, null, null, 0, 100) ?? new List<SchemaDefinition>();

        foreach (var referencingSchema in referencingSchemas)
        {
            if (referencingSchema.SchemaType == SchemaType.Entity)
            {
                await AddReferenceInnerFieldsToSchemaAsync(referencingSchema);
                await _repository.UpdateAsync(referencingSchema);
                await _schemaChangeLogService.CreateSchemaChangeLogAsync(referencingSchema.ItemId, SchemaChangeType.SchemaFieldUpdate);
            }
            else
                await ApplyChangesToReferenceEntityFields(referencingSchema, new HashSet<string>(visitedSchemaNames, StringComparer.OrdinalIgnoreCase));
        }
    }

    /// <summary>Maps DTO schema references (which entities use each DTO) onto the response list.</summary>
    public async Task MapDtoSchemasReferencesToResponse(List<SchemaDefinitionResponse> items)
    {
        var dtoSchemas = items.Where(item => item.SchemaType == SchemaType.Dto).Select(x => x.SchemaName).ToList();
        if (dtoSchemas.Count == 0) return;

        var dtoFilter = new BsonDocument
        {
            { $"{nameof(SchemaDefinition.Fields)}.{nameof(FieldDefinition.Type)}", new BsonDocument("$in", new BsonArray(dtoSchemas)) }
        };

        var dtoUsedInEntities = await _repository.GetItemsAsync<SchemaDefinition>(dtoFilter, null, null, 0, 100);
        if (dtoUsedInEntities.Count == 0) return;

        foreach (var dtoSchema in dtoSchemas)
        {
            var dto = items.FirstOrDefault(x => x.SchemaName == dtoSchema && x.SchemaType == SchemaType.Dto);
            if (dto == null) continue;
            dto.SchemaReferences = dtoUsedInEntities.Where(x => x.Fields.Any(f => f.Type == dtoSchema)).Select(x => x.SchemaName).ToList();
            dto.TotalSchemaReferences = dto.SchemaReferences.Count;
        }
    }

    private static FieldDefinition CreateReferenceFieldDefinition(FieldDefinition field, string currentPath, string referenceFieldType)
    {
        return new FieldDefinition
        {
            Name = currentPath,
            Type = field.Type,
            IsArray = field.IsArray,
            IsPIIData = field.IsPIIData,
            IsUniqueData = field.IsUniqueData,
            RequiredOn = field.RequiredOn,
            Description = field.Description,
            IsReferenceField = true,
            ReferenceFieldType = referenceFieldType,
            ReadAccessLevel = SchemaAccessLevel.Inherited,
            WriteAccessLevel = SchemaAccessLevel.Inherited,
            EditAccessLevel = SchemaAccessLevel.Inherited,
            DeleteAccessLevel = SchemaAccessLevel.Inherited
        };
    }
}
