using Blocks.DataAccess.Models;
using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Policies;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Mappers;

public static class SchemaDefinitionMapping
{
    public static SchemaDefinitionResponse MapToResponse(this SchemaDefinition schema
    , List<DataAccessPolicy> policies
    , List<DataValidation> validations)
    {
        var projectSchema = schema.GetSchemaNameForProject();
        var response = new SchemaDefinitionResponse
        {
            Id = schema.ItemId,
            CollectionName = schema.CollectionName,
            SchemaName = schema.SchemaName,
            SchemaType = schema.SchemaType,
            ProjectShortKey = schema.ProjectShortKey,
            ProjectKey = schema.ProjectKey,
            ProjectSchemaName = projectSchema,
            QuerySchema = $"{projectSchema}s",
            ReadAccessLevel = schema.ReadAccessLevel,
            WriteAccessLevel = schema.WriteAccessLevel,
            EditAccessLevel = schema.EditAccessLevel,
            DeleteAccessLevel = schema.DeleteAccessLevel,
            MutationSchemas =
            [
                $"insert{projectSchema}", $"update{projectSchema}", $"delete{projectSchema}"
            ]
        };
        response.Fields = GetFieldDefinitionResponses(schema.Fields, policies, validations);
        if (policies is not null)
        {
            response.ReadPolicies = policies.Where(p => p.PolicyType == PolicyType.RLS && p.Operation == PolicyOperation.READ).ToList();
            response.WritePolicies = policies.Where(p => p.PolicyType == PolicyType.RLS && p.Operation == PolicyOperation.WRITE).ToList();
            response.EditPolicies = policies.Where(p => p.PolicyType == PolicyType.RLS && p.Operation == PolicyOperation.EDIT).ToList();
            response.DeletePolicies = policies.Where(p => p.PolicyType == PolicyType.RLS && p.Operation == PolicyOperation.DELETE).ToList();
            response.TotalReadPolicies = response.ReadPolicies.Count;
            response.TotalWritePolicies = response.WritePolicies.Count;
            response.TotalEditPolicies = response.EditPolicies.Count;
            response.TotalDeletePolicies = response.DeletePolicies.Count;
        }
        
        return response;
    }

    private static List<FieldDefinitionResponse> GetFieldDefinitionResponses(List<FieldDefinition> fields, List<DataAccessPolicy> policies, List<DataValidation> validations, List<SchemaDefinition> schemaReferences, string parentPath = "")
    {
        var fieldResponses = new List<FieldDefinitionResponse>();
        foreach (var field in fields)
        {
            var currentPath = string.IsNullOrWhiteSpace(parentPath) ? field.Name : $"{parentPath}.{field.Name}";
            var fieldResponse = field.MapFieldToResponse(policies);
            if (GraphQlTypeHelper.IsScalar(field.Type))
            {
                fieldResponse.ValidationRule = validations.FirstOrDefault(v => v.FieldName == currentPath);
            }
            else
            {
                var refFields = schemaReferences.FirstOrDefault(x => x.SchemaName == field.Type)?.Fields ?? [];
                fieldResponse.Fields = GetFieldDefinitionResponses(refFields, policies, validations, schemaReferences, currentPath);
            }
            fieldResponses.Add(fieldResponse);
        }
        return fieldResponses;
    }
    public static List<FieldDefinitionResponse> GetFieldDefinitionResponses(List<FieldDefinition> fields, List<DataAccessPolicy> policies, List<DataValidation> validations, string parentPath = "") =>
        FieldDefinitionMapper.GetFieldDefinitionResponses(fields, policies, validations, parentPath);

    public static List<CollectionFieldResponse> MapToCollectionFields(this List<FieldDefinitionResponse> fields)
    {
        return [.. fields.Select(f =>
        {
            var description = !string.IsNullOrEmpty(f.Description)
                ? f.Description
                : DefaultValueInjection.DefaultFieldDescriptions.GetValueOrDefault(f.Name, string.Empty);

            return new CollectionFieldResponse
            {
                Name = f.Name,
                Type = f.IsArray ? $"[{f.Type}]" : f.Type,
                Description = description,
                Fields = f.Fields.Count > 0 ? f.Fields.MapToCollectionFields() : null
            };
        })];
    }

    public static SchemaDefinitionResponse MapToResponse(this SchemaDefinition schema)
    {
        var projectSchema = schema.GetSchemaNameForProject();
        var response = new SchemaDefinitionResponse
        {
            Id = schema.ItemId,
            CollectionName = schema.CollectionName,
            Fields = schema.Fields?.Select(f => f.MapFieldToResponse()).ToList() ?? [],
            SchemaName = schema.SchemaName,
            SchemaType = schema.SchemaType,
            ProjectShortKey = schema.ProjectShortKey,
            ProjectKey = schema.ProjectKey,
            ProjectSchemaName = projectSchema,
            QuerySchema = $"{projectSchema}s",
            ReadAccessLevel = schema.ReadAccessLevel,
            WriteAccessLevel = schema.WriteAccessLevel,
            EditAccessLevel = schema.EditAccessLevel,
            DeleteAccessLevel = schema.DeleteAccessLevel,
            MutationSchemas =
            [
                $"insert{projectSchema}", $"update{projectSchema}", $"delete{projectSchema}"
            ]
        };

        return response;
    }


    private static FieldDefinitionResponse MapFieldToResponse(this FieldDefinition field, IEnumerable<DataAccessPolicy>? policies = null) =>
        FieldDefinitionMapper.MapFieldToResponse(field, policies);

}
