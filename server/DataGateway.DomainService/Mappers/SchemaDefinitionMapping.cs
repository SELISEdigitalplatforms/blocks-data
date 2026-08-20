using DataGateway.DomainService.Entities;
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
    public static List<FieldDefinitionResponse> GetFieldDefinitionResponses(List<FieldDefinition> fields, List<DataAccessPolicy> policies, List<DataValidation> validations, string parentPath = "")
    {
        var fieldResponses = new List<FieldDefinitionResponse>();
        var isRoot = string.IsNullOrWhiteSpace(parentPath);

        // At root: direct fields are those with ReferenceFieldPath == ""
        // At nested level: direct children are unique first segments under parentPath
        List<string> directChildSegments;
        if (isRoot)
        {
            directChildSegments = fields
                .Where(f => !f.IsReferenceField)
                .Select(f => f.Name)
                .Distinct()
                .ToList();
        }
        else
        {
            var prefix = parentPath + ".";
            directChildSegments = fields
                .Where(f => f.Name.StartsWith(prefix))
                .Select(f =>
                {
                    var afterPrefix = f.Name.Substring(prefix.Length);
                    var nextDot = afterPrefix.IndexOf('.');
                    return nextDot >= 0 ? afterPrefix.Substring(0, nextDot) : afterPrefix;
                })
                .Distinct()
                .ToList();
        }

        foreach (var segment in directChildSegments)
        {
            var currentPath = isRoot ? segment : parentPath + "." + segment;
            var field = fields.FirstOrDefault(f => f.Name == currentPath);

            FieldDefinitionResponse fieldResponse;
            if (field != null)
            {
                fieldResponse = field.MapFieldToResponse(policies);
                if (GraphQlTypeHelper.IsScalar(field.Type))
                {
                    fieldResponse.ValidationRule = validations.FirstOrDefault(v => v.FieldName == currentPath);
                }
                else
                {
                    fieldResponse.Fields = GetFieldDefinitionResponses(fields, policies, validations, currentPath);
                }
            }
            else
            {
                // Synthetic reference node (e.g. Child.L2Child with only Child.L2Child.Name and Child.L2Child.Qty)
                fieldResponse = new FieldDefinitionResponse
                {
                    Name = segment,
                    Type = fields.FirstOrDefault(f => f.Name.StartsWith(currentPath))?.ReferenceFieldType ?? string.Empty,
                    IsArray = false,
                    IsPIIData = false,
                    IsUniqueData = false,
                    Description = string.Empty,
                    Fields = GetFieldDefinitionResponses(fields, policies, validations, currentPath),
                    ReadAccessLevel = SchemaAccessLevel.Inherited,
                    WriteAccessLevel = SchemaAccessLevel.Inherited,
                    EditAccessLevel = SchemaAccessLevel.Inherited,
                    DeleteAccessLevel = SchemaAccessLevel.Inherited
                };
            }

            fieldResponses.Add(fieldResponse);
        }

        return fieldResponses;
    }

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


    private static FieldDefinitionResponse MapFieldToResponse(this FieldDefinition field, IEnumerable<DataAccessPolicy> policies = null)
    {
        var fieldNameParts = field.Name?.Split('.') ?? [];
        var response = new FieldDefinitionResponse
        {
            Name = fieldNameParts is null || fieldNameParts.Length < 1 ? string.Empty : fieldNameParts.Last(),
            Type = field.Type,
            IsArray = field.IsArray,
            IsPIIData = field.IsPIIData,
            IsUniqueData = field.IsUniqueData,
            RequiredOn = field.RequiredOn,
            Description = !string.IsNullOrEmpty(field.Description)
                ? field.Description
                : DefaultValueInjection.DefaultFieldDescriptions.TryGetValue(field.Name, out var fallback)
                    ? fallback
                    : string.Empty,
            ReadAccessLevel = field.ReadAccessLevel,
            WriteAccessLevel = field.WriteAccessLevel,
            EditAccessLevel = field.EditAccessLevel,
            DeleteAccessLevel = field.DeleteAccessLevel
        };
        if (policies is not null)
        {
            response.TotalReadPolicies = policies.Count(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ && p.FieldNames.Contains(field.Name));
            response.TotalWritePolicies = policies.Count(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.WRITE && p.FieldNames.Contains(field.Name));
            response.TotalEditPolicies = policies.Count(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.EDIT && p.FieldNames.Contains(field.Name));
            response.TotalDeletePolicies = policies.Count(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.DELETE && p.FieldNames.Contains(field.Name));
        }

        return response;
    }

}
