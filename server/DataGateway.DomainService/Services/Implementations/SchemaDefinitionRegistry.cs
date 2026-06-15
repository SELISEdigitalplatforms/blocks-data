using System.Collections.Concurrent;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;

namespace DataGateway.DomainService.Services;

public class SchemaDefinitionRegistry : ISchemaDefinitionRegistry
{
    private readonly IDbRepository _repository;
    private readonly ILogger<SchemaDefinitionRegistry> _logger;
    private volatile IReadOnlyList<SchemaDefinitionExtended> _schemas = Array.Empty<SchemaDefinitionExtended>();
    private readonly ConcurrentDictionary<string, SchemaDefinitionExtended> _byName = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _reloadLock = new(1, 1);

    public SchemaDefinitionRegistry(IDbRepository repository, ILogger<SchemaDefinitionRegistry> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<SchemaDefinitionExtended?> GetByNameAsync(string schemaName)
    {
        if (_byName.Count == 0)
            await ReloadAsync();

        _byName.TryGetValue(schemaName, out var schema);
        return schema;
    }

    public async Task<IReadOnlyList<SchemaDefinitionExtended>> GetAllAsync()
    {
        if (_schemas.Count == 0)
            await ReloadAsync();

        return _schemas;
    }

    public async Task ReloadAsync()
    {
        await _reloadLock.WaitAsync();
        try
        {
            _logger.LogInformation("Reloading schema definitions for REST gateway");
            var schemas = await LoadSchemaDefinitionsAsync();

            _byName.Clear();
            foreach (var s in schemas)
            {
                _byName[s.SchemaName] = s;
                var nameForProject = s.GetSchemaNameForProject();
                if (nameForProject != s.SchemaName)
                    _byName[nameForProject] = s;
            }

            _schemas = schemas;
            _logger.LogInformation("Loaded {Count} schema definitions for REST gateway", schemas.Count);
        }
        finally
        {
            _reloadLock.Release();
        }
    }

    private async Task<List<SchemaDefinitionExtended>> LoadSchemaDefinitionsAsync()
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
            filter, null, null, 0, 1000, GraphQlConstant.TenantId);

        var validations = await _repository.GetItemsAsync<DataValidation>(
            new BsonDocument { { nameof(DataValidation.IsDeleted), false } },
            null, null, 0, 1000, GraphQlConstant.TenantId);

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
                ValidationRule = validations.FirstOrDefault(v => v.SchemaId == s.ItemId && v.FieldName == f.Name),
                ReadAccessLevel = f.ReadAccessLevel,
                WriteAccessLevel = f.WriteAccessLevel,
                EditAccessLevel = f.EditAccessLevel,
                DeleteAccessLevel = f.DeleteAccessLevel,
            }).ToList(),
            CollectionName = s.CollectionName,
            Policies = []
        }).ToList();

        var policyFilter = new BsonDocument { { nameof(DataAccessPolicy.IsDeleted), false } };
        var policies = await _repository.GetItemsAsync<DataAccessPolicy>(
            policyFilter, null, null, 0, 1000, GraphQlConstant.TenantId);

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
                AddInheritedClsPoliciesToSchema(schema, rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.READ || p.Operation == PolicyOperation.ALL), fullPath, PolicyOperation.READ);
            if (field.WriteAccessLevel == SchemaAccessLevel.Inherited)
                AddInheritedClsPoliciesToSchema(schema, rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.WRITE || p.Operation == PolicyOperation.ALL), fullPath, PolicyOperation.WRITE);
            if (field.EditAccessLevel == SchemaAccessLevel.Inherited)
                AddInheritedClsPoliciesToSchema(schema, rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.EDIT || p.Operation == PolicyOperation.ALL), fullPath, PolicyOperation.EDIT);
            if (field.DeleteAccessLevel == SchemaAccessLevel.Inherited)
                AddInheritedClsPoliciesToSchema(schema, rlsSchemaPolicies.Where(p => p.Operation == PolicyOperation.DELETE || p.Operation == PolicyOperation.ALL), fullPath, PolicyOperation.DELETE);
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
                    RemoveClsPolicy(schema, policy, fieldPath);
                else if (policy.Operation == PolicyOperation.WRITE && IgnoreClsPolicy(schema.WriteAccessLevel, effectiveWrite))
                    RemoveClsPolicy(schema, policy, fieldPath);
                else if (policy.Operation == PolicyOperation.EDIT && IgnoreClsPolicy(schema.EditAccessLevel, effectiveEdit))
                    RemoveClsPolicy(schema, policy, fieldPath);
                else if (policy.Operation == PolicyOperation.DELETE && IgnoreClsPolicy(schema.DeleteAccessLevel, effectiveDelete))
                    RemoveClsPolicy(schema, policy, fieldPath);
            }
        }
    }

    private static bool IgnoreClsPolicy(SchemaAccessLevel schemaAccessLevel, SchemaAccessLevel fieldAccessLevel)
    {
        if (fieldAccessLevel == SchemaAccessLevel.Public || fieldAccessLevel == SchemaAccessLevel.User)
            return true;
        if (fieldAccessLevel == SchemaAccessLevel.Inherited && schemaAccessLevel != SchemaAccessLevel.Custom)
            return true;
        return false;
    }

    private static void RemoveClsPolicy(SchemaDefinitionExtended schema, DataAccessPolicy clsPolicy, string fieldName)
    {
        if (clsPolicy.FieldNames.Length > 1)
        {
            var policy = schema.Policies.FirstOrDefault(p => p.ItemId == clsPolicy.ItemId);
            if (policy is null) return;
            policy.FieldNames = policy.FieldNames.Where(f => f != fieldName).ToArray();
        }
        else
        {
            schema.Policies.RemoveAll(p => p.ItemId == clsPolicy.ItemId);
        }
    }

    private static void AddInheritedClsPoliciesToSchema(SchemaDefinitionExtended schema,
        IEnumerable<DataAccessPolicy> rlsSchemaPolicies, string fieldPath, PolicyOperation operation)
    {
        if (operation == PolicyOperation.READ && (schema.ReadAccessLevel == SchemaAccessLevel.Public || schema.ReadAccessLevel == SchemaAccessLevel.User))
            return;
        if (operation == PolicyOperation.WRITE && (schema.WriteAccessLevel == SchemaAccessLevel.Public || schema.WriteAccessLevel == SchemaAccessLevel.User))
            return;
        if (operation == PolicyOperation.EDIT && (schema.EditAccessLevel == SchemaAccessLevel.Public || schema.EditAccessLevel == SchemaAccessLevel.User))
            return;
        if (operation == PolicyOperation.DELETE && (schema.DeleteAccessLevel == SchemaAccessLevel.Public || schema.DeleteAccessLevel == SchemaAccessLevel.User))
            return;

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
}
