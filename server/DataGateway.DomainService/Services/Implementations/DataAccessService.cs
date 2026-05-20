using System;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class DataAccessService : IDataAccessService
{
    private readonly IDbRepository _dbRepository;
    private readonly IRequestValidator _requestValidator;
    private readonly ISchemaChangeLogService _schemaChangeLogService;

    public DataAccessService(IDbRepository dbRepository, IRequestValidator requestValidator, ISchemaChangeLogService schemaChangeLogService)
    {
        _dbRepository = dbRepository;
        _requestValidator = requestValidator;
        _schemaChangeLogService = schemaChangeLogService;
    }
    public Task IsDataAccessible()
    {
        throw new NotImplementedException();
    }

    public async Task<ServiceResponse<ActionResponse>> ConfigureSecurity(ConfigureSchemaSecurityRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(request.SchemaId);

        var (isValid, errorMessage) = ValidateFieldNames(request.PolicyType, request.FieldNames, schema);
        if (!isValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrorMessage(errorMessage)
                .SetHttpStatusCode(400);
        }
        if (request.PolicyType == PolicyType.RLS)
        {
            ConfigureSchemaAccess(schema, request.Operation, request.AccessLevel);
        }
        else if (request.PolicyType == PolicyType.CLS)
        {
            ConfigureFieldAccess(schema, request.FieldNames, request.Operation, request.AccessLevel);
        }

        await _dbRepository.UpdateAsync(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaAccessLevelUpdate);
        return new ServiceResponse<ActionResponse>().SetSuccessMessage("CONFIGURATION_SAVED");
    }

    public async Task<ServiceResponse<ActionResponse>> CreateDataAccessPolicy(CreateDataAccessPolicyRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(request.SchemaId);

        var (isValid, errorMessage) = ValidateFieldNames(request.PolicyType, request.FieldNames, schema);
        if (!isValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrorMessage(errorMessage)
                .SetHttpStatusCode(400);
        }
        var response = new ServiceResponse<ActionResponse>();
        var policy = new DataAccessPolicy
        {
            PolicyName = request.PolicyName,
            PolicyDescription = request.PolicyDescription,
            PolicyType = request.PolicyType,
            Operation = request.Operation,
            SchemaName = schema.SchemaName,
            SchemaId = request.SchemaId,
            FieldNames = request.FieldNames,
            RuleGroup = request.RuleGroup,
            Priority = request.Priority,
            IsAllowPolicy = request.IsAllowPolicy
        };
        policy.InjectDefaultValue();
        await _dbRepository.InsertAsync(policy);
        await ChangeSchemaFieldAccessLevelWhenCustomPolicyApplied(schema, policy);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaPolicyCreate);
        return response.SetSuccess(new ActionResponse
        {
            ItemId = policy.ItemId,
            Acknowledged = true,
            TotalImpactedData = 1
        }).SetSuccessMessage("Data_Access_Policy_Saved_Successfully");
    }

    public async Task<ServiceResponse<ActionResponse>> UpdateDataAccessPolicy(UpdateDataAccessPolicyRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var response = new ServiceResponse<ActionResponse>();
        var filter = Builders<DataAccessPolicy>.Filter.Eq(x => x.ItemId, request.ItemId);
        var policy = await _dbRepository.GetItemAsync<DataAccessPolicy>(filter);
        if (policy is null)
        {
            return response.SetErrorMessage("Data_Access_Policy_Not_Found")
                .SetHttpStatusCode(400);
        }
        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(policy.SchemaId);
        var (isValid, errorMessage) = ValidateFieldNames(policy.PolicyType, request.FieldNames, schema);
        if (!isValid)
        {
            return response.SetErrorMessage(errorMessage)
                .SetHttpStatusCode(400);
        }
        policy.PolicyName = request.PolicyName ?? policy.PolicyName;
        policy.PolicyDescription = request.PolicyDescription ?? policy.PolicyDescription;
        policy.FieldNames = request.FieldNames ?? policy.FieldNames;
        policy.RuleGroup = request.RuleGroup ?? policy.RuleGroup;
        policy.Priority = request.Priority ?? policy.Priority;
        policy.IsAllowPolicy = request.IsAllowPolicy ?? policy.IsAllowPolicy;
        policy.ReferencePolicyId = string.Empty;
        await _dbRepository.UpdateAsync(filter, policy);
        await ChangeSchemaFieldAccessLevelWhenCustomPolicyApplied(schema, policy);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(policy.ItemId, SchemaChangeType.SchemaPolicyUpdate);
        return response.SetSuccess(new ActionResponse
        {
            ItemId = policy.ItemId,
            Acknowledged = true,
            TotalImpactedData = 1
        }).SetSuccessMessage("Data_Access_Policy_Updated_Successfully");
    }
    public async Task<ServiceResponse<ActionResponse>> DeleteDataAccessPolicy(string itemId, string projectKey)
    {
        var response = new ServiceResponse<ActionResponse>();
        var filter = Builders<DataAccessPolicy>.Filter.Eq(x => x.ItemId, itemId);
        var policy = await _dbRepository.GetItemAsync<DataAccessPolicy>(filter);
        if (policy is null)
        {
            return response.SetErrorMessage("Data_Access_Policy_Not_Found")
                .SetHttpStatusCode(404);
        }
        await _dbRepository.DeleteAsync(filter);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(policy.ItemId, SchemaChangeType.SchemaPolicyUpdate);
        return response.SetSuccess(new ActionResponse
        {
            ItemId = policy.ItemId,
            Acknowledged = true,
            TotalImpactedData = 1
        }).SetSuccessMessage("Data_Access_Policy_Deleted_Successfully");
    }
    public async Task<ServiceResponse<List<DataAccessPolicyResponse>>> GetEntityDataAccessPolicy(string entityName)
    {
        var response = new ServiceResponse<List<DataAccessPolicyResponse>>();
        var filter = Builders<DataAccessPolicy>.Filter.Eq(x => x.SchemaName, entityName);
        var policies = await _dbRepository.GetItemsAsync<DataAccessPolicy, DataAccessPolicyResponse>(filter);
        return response.SetSuccess(policies);
    }


    private static void ConfigureSchemaAccess(SchemaDefinition schema, PolicyOperation operation, SchemaAccessLevel accessLevel)
    {
        if (operation == PolicyOperation.READ)
        {
            schema.ReadAccessLevel = accessLevel;
        }
        else if (operation == PolicyOperation.WRITE)
        {
            schema.WriteAccessLevel = accessLevel;
        }
        else if (operation == PolicyOperation.EDIT)
        {
            schema.EditAccessLevel = accessLevel;
        }
        else if (operation == PolicyOperation.DELETE)
        {
            schema.DeleteAccessLevel = accessLevel;
        }
    }

    private static void ConfigureFieldAccess(SchemaDefinition schema, string[] fieldNames, PolicyOperation operation, SchemaAccessLevel accessLevel)
    {
        foreach (var fieldName in fieldNames)
        {
            var field = schema.Fields.FirstOrDefault(f => f.Name == fieldName);

            if (field is null)
            {
                continue;
            }

            if (operation == PolicyOperation.READ)
            {
                field.ReadAccessLevel = accessLevel;
            }
            else if (operation == PolicyOperation.WRITE)
            {
                field.WriteAccessLevel = accessLevel;
            }
            else if (operation == PolicyOperation.EDIT)
            {
                field.EditAccessLevel = accessLevel;
            }
            else if (operation == PolicyOperation.DELETE)
            {
                field.DeleteAccessLevel = accessLevel;
            }
        }
    }

    private async Task ChangeSchemaFieldAccessLevelWhenCustomPolicyApplied(SchemaDefinition schema, DataAccessPolicy policy)
    {
        if (policy.PolicyType == PolicyType.RLS)
            return;
        foreach (var field in schema.Fields)
        {
            if (policy.FieldNames.Contains(field.Name))
            {
                field.ReadAccessLevel = policy.Operation == PolicyOperation.READ ? SchemaAccessLevel.Custom : field.ReadAccessLevel;
                field.WriteAccessLevel = policy.Operation == PolicyOperation.WRITE ? SchemaAccessLevel.Custom : field.WriteAccessLevel;
                field.EditAccessLevel = policy.Operation == PolicyOperation.EDIT ? SchemaAccessLevel.Custom : field.EditAccessLevel;
                field.DeleteAccessLevel = policy.Operation == PolicyOperation.DELETE ? SchemaAccessLevel.Custom : field.DeleteAccessLevel;
            }
        }
        await _dbRepository.UpdateAsync(schema);
    }

    private static (bool isValid, string errorMessage) ValidateFieldNames(PolicyType policyType, string[]? fieldNames = null, SchemaDefinition? schema = null)
    {
        if (schema is null)
        {
            return (false, "INVALID_SCHEMA_ID");
        }
        if (policyType == PolicyType.RLS && fieldNames is not null && fieldNames.Length > 0)
        {
            return (false, "FIELD_NAMES_ARE_NOT_ALLOWED_FOR_ROW_LEVEL_SECURITY");
        }
        else if (policyType == PolicyType.CLS && fieldNames is null)
        {
            return (false, "FIELD_NAMES_ARE_REQUIRED_FOR_COLUMN_LEVEL_SECURITY");
        }
        else if (policyType == PolicyType.CLS && fieldNames.Any(f => !schema.Fields.Any(s => s.Name == f)))
        {
            return (false, "INVALID_FIELD_NAMES");
        }
        return (true, string.Empty);
    }
}