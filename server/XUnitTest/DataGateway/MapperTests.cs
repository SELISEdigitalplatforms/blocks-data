using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using FluentAssertions;

namespace XUnitTest.DataGateway;

public class SchemaDefinitionMappingTests
{
    private static SchemaDefinition Schema() => new()
    {
        ItemId = "s1",
        CollectionName = "Persons",
        SchemaName = "Person",
        SchemaType = SchemaType.Entity,
        ProjectKey = "pk",
        ProjectShortKey = "psk",
        ReadAccessLevel = SchemaAccessLevel.Public,
        Fields = new List<FieldDefinition>
        {
            new() { Name = "Email", Type = "String", Description = "Email addr" },
            new() { Name = "Age", Type = "Int" }
        }
    };

    [Fact]
    public void MapToResponse_NoPolicies_BuildsBasics()
    {
        var response = Schema().MapToResponse();

        response.Id.Should().Be("s1");
        response.SchemaName.Should().Be("Person");
        response.QuerySchema.Should().Be("Persons");
        response.MutationSchemas.Should().Contain("insertPerson");
        response.Fields.Should().HaveCount(2);
    }

    [Fact]
    public void MapToResponse_WithPolicies_CountsByOperation()
    {
        var policies = new List<DataAccessPolicy>
        {
            new() { PolicyType = PolicyType.RLS, Operation = PolicyOperation.READ },
            new() { PolicyType = PolicyType.RLS, Operation = PolicyOperation.WRITE },
            new() { PolicyType = PolicyType.CLS, Operation = PolicyOperation.READ, FieldNames = new[] { "Email" } }
        };
        var validations = new List<DataValidation>
        {
            new() { FieldName = "Email", Validations = new() { new ValidationRule { Type = ValidationType.NotEmpty } } }
        };

        var response = Schema().MapToResponse(policies, validations);

        response.TotalReadPolicies.Should().Be(1);
        response.TotalWritePolicies.Should().Be(1);
        response.ReadPolicies.Should().ContainSingle();
        var emailField = response.Fields.First(f => f.Name == "Email");
        emailField.ValidationRule.Should().NotBeNull();
        emailField.TotalReadPolicies.Should().Be(1);
    }

    [Fact]
    public void MapToResponse_UsesDefaultFieldDescription_WhenEmpty()
    {
        var schema = Schema();
        schema.Fields.Add(new FieldDefinition { Name = nameof(GraphQlBaseEntity.ItemId), Type = "String" });

        var response = schema.MapToResponse(new List<DataAccessPolicy>(), new List<DataValidation>());

        var idField = response.Fields.First(f => f.Name == nameof(GraphQlBaseEntity.ItemId));
        idField.Description.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void GetFieldDefinitionResponses_BuildsNestedHierarchy()
    {
        var fields = new List<FieldDefinition>
        {
            new() { Name = "Name", Type = "String" },
            new() { Name = "Contact", Type = "ContactInfo", IsReferenceField = false },
            new() { Name = "Contact.Email", Type = "String", IsReferenceField = true, ReferenceFieldType = "ContactInfo" },
            new() { Name = "Contact.Phone", Type = "String", IsReferenceField = true, ReferenceFieldType = "ContactInfo" }
        };

        var result = SchemaDefinitionMapping.GetFieldDefinitionResponses(fields, new List<DataAccessPolicy>(), new List<DataValidation>(), "");

        result.Should().Contain(f => f.Name == "Name");
        var contact = result.First(f => f.Name == "Contact");
        contact.Fields.Should().HaveCount(2);
    }

    [Fact]
    public void GetFieldDefinitionResponses_SyntheticReferenceNode()
    {
        var fields = new List<FieldDefinition>
        {
            new() { Name = "Child", Type = "ChildType", IsReferenceField = false },
            new() { Name = "Child.L2.Name", Type = "String", IsReferenceField = true, ReferenceFieldType = "L2Type" },
            new() { Name = "Child.L2.Qty", Type = "Int", IsReferenceField = true, ReferenceFieldType = "L2Type" }
        };

        var result = SchemaDefinitionMapping.GetFieldDefinitionResponses(fields, new List<DataAccessPolicy>(), new List<DataValidation>(), "");

        var child = result.First(f => f.Name == "Child");
        // "Child.L2" has no exact field entry, so it is reconstructed as a synthetic reference node.
        var l2 = child.Fields.First(f => f.Name == "L2");
        l2.Type.Should().Be("L2Type");
        l2.Fields.Select(f => f.Name).Should().Contain(new[] { "Name", "Qty" });
    }

    [Fact]
    public void GetFieldDefinitionResponses_SyntheticReferenceNode_DoesNotMatchSiblingPrefix()
    {
        var fields = new List<FieldDefinition>
        {
            new() { Name = "Child", Type = "ChildType", IsReferenceField = false },
            new() { Name = "Child.L2Code", Type = "String", IsReferenceField = true, ReferenceFieldType = "ChildType" },
            new() { Name = "Child.L2.Name", Type = "String", IsReferenceField = true, ReferenceFieldType = "L2Type" }
        };

        var result = SchemaDefinitionMapping.GetFieldDefinitionResponses(
            fields, new List<DataAccessPolicy>(), new List<DataValidation>(), "");

        result.Single(field => field.Name == "Child")
            .Fields.Single(field => field.Name == "L2")
            .Type.Should().Be("L2Type");
    }

    [Fact]
    public void RestoreMissingReferenceFieldTypes_LegacyNestedPath_ResolvesContainingType()
    {
        var schemas = new List<SchemaDefinition>
        {
            new()
            {
                SchemaName = "Agreement",
                SchemaType = SchemaType.Entity,
                Fields = new()
                {
                    new FieldDefinition { Name = "Signatories", Type = "Signatory" },
                    new FieldDefinition { Name = "Signatories.SignatureColor", Type = "String", IsReferenceField = true },
                    new FieldDefinition { Name = "Signatories.Signature.Value", Type = "String", IsReferenceField = true }
                }
            },
            new()
            {
                SchemaName = "Signatory",
                SchemaType = SchemaType.Dto,
                Fields = new()
                {
                    new FieldDefinition { Name = "SignatureColor", Type = "String" },
                    new FieldDefinition { Name = "Signature", Type = "Signature" }
                }
            },
            new()
            {
                SchemaName = "Signature",
                SchemaType = SchemaType.Dto,
                Fields = new() { new FieldDefinition { Name = "Value", Type = "String" } }
            }
        };

        GraphqlSchemaBuilder.RestoreMissingReferenceFieldTypes(schemas);

        var fields = schemas[0].Fields;
        fields.Single(field => field.Name == "Signatories.SignatureColor")
            .ReferenceFieldType.Should().Be("Signatory");
        fields.Single(field => field.Name == "Signatories.Signature.Value")
            .ReferenceFieldType.Should().Be("Signature");
    }

    [Fact]
    public void MapToCollectionFields_WrapsArrayTypesAndNests()
    {
        var fields = new List<FieldDefinitionResponse>
        {
            new() { Name = "Tags", Type = "String", IsArray = true },
            new()
            {
                Name = "Contact",
                Type = "ContactInfo",
                Fields = new List<FieldDefinitionResponse> { new() { Name = "Email", Type = "String" } }
            }
        };

        var result = fields.MapToCollectionFields();

        result.First(f => f.Name == "Tags").Type.Should().Be("[String]");
        result.First(f => f.Name == "Contact").Fields.Should().NotBeNull();
    }
}

public class DataValidationMappingTests
{
    [Fact]
    public void MapToResponse_MapsEntity()
    {
        var entity = new DataValidation
        {
            ItemId = "v1",
            SchemaId = "s1",
            FieldName = "Email",
            Validations = new() { new ValidationRule { Type = ValidationType.Regex, Value = "^a$", ErrorMessage = "bad", IsActive = true } }
        };

        var response = entity.MapToResponse();

        response.ItemId.Should().Be("v1");
        response.Validations.Should().ContainSingle();
        response.Validations[0].Type.Should().Be(ValidationType.Regex);
        response.Validations[0].ErrorMessage.Should().Be("bad");
    }

    [Fact]
    public void MapRuleToEntity_ConvertsJsonValue()
    {
        var request = new ValidationRuleRequest
        {
            Type = ValidationType.MaxLength,
            Value = System.Text.Json.JsonDocument.Parse("10").RootElement,
            ErrorMessage = "too long",
            IsActive = true
        };

        var entity = request.MapToEntity();

        entity.Type.Should().Be(ValidationType.MaxLength);
        entity.Value.Should().Be(10L);
    }
}

public class SchemaExportImportMappingTests
{
    private static SchemaDefinition Schema() => new()
    {
        ItemId = "s1",
        CollectionName = "Persons",
        SchemaName = "Person",
        SchemaType = SchemaType.Entity,
        ReadAccessLevel = SchemaAccessLevel.Public,
        Fields = new List<FieldDefinition>
        {
            new() { Name = "Email", Type = "String", IsPIIData = true },
            new() { Name = "Age", Type = "Int" }
        }
    };

    [Fact]
    public void MapToExportDocuments_SchemaOnly_NoPolicyOrValidationOnFields()
    {
        var docs = new List<SchemaDefinition> { Schema() }.MapToExportDocuments(
            new List<DataAccessPolicy>(), new List<DataValidation>(), SchemaExportOption.Schema);

        var doc = docs.Single();
        doc.SchemaName.Should().Be("Person");
        doc.Fields.Should().HaveCount(2);
        doc.Fields[0].AccessPolicies.Should().BeNull();
        doc.Fields[0].ValidationRules.Should().BeNull();
    }

    [Fact]
    public void MapToExportDocuments_All_IncludesRlsClsValidations()
    {
        var policies = new List<DataAccessPolicy>
        {
            new() { PolicyType = PolicyType.RLS, SchemaName = "Person", PolicyName = "R1" },
            new() { PolicyType = PolicyType.CLS, SchemaName = "Person", PolicyName = "C1", FieldNames = new[] { "Email" } }
        };
        var validations = new List<DataValidation>
        {
            new() { SchemaId = "s1", FieldName = "Email", Validations = new() { new ValidationRule { Type = ValidationType.NotEmpty } } }
        };

        var docs = new List<SchemaDefinition> { Schema() }.MapToExportDocuments(policies, validations, SchemaExportOption.All);

        var doc = docs.Single();
        doc.RowLevelPolicies.Should().ContainSingle();
        var email = doc.Fields.First(f => f.Name == "Email");
        email.AccessPolicies.Should().ContainSingle();
        email.ValidationRules.Should().ContainSingle();
    }

    [Fact]
    public void MapToSchemaDefinition_MapsFields()
    {
        var doc = new SchemaExportDocument
        {
            CollectionName = "Persons",
            SchemaName = "Person",
            SchemaType = SchemaType.Entity,
            Fields = new() { new ExportFieldDefinition { Name = "Email", Type = "String", IsReferenceField = true } }
        };

        var schema = doc.MapToSchemaDefinition();

        schema.SchemaName.Should().Be("Person");
        schema.Fields.Single().IsReferenceField.Should().BeTrue();
    }

    [Fact]
    public void MapToRlsPolicy_SetsRlsType()
    {
        var policy = new ExportAccessPolicy { PolicyName = "R1", Operation = PolicyOperation.WRITE }.MapToRlsPolicy("s1", "Person");
        policy.PolicyType.Should().Be(PolicyType.RLS);
        policy.SchemaId.Should().Be("s1");
        policy.FieldNames.Should().BeEmpty();
    }

    [Fact]
    public void MapToClsPolicies_GroupsFieldsByPolicyName()
    {
        var doc = new SchemaExportDocument
        {
            SchemaName = "Person",
            Fields = new()
            {
                new ExportFieldDefinition { Name = "Email", AccessPolicies = new() { new ExportAccessPolicy { PolicyName = "C1" } } },
                new ExportFieldDefinition { Name = "Phone", AccessPolicies = new() { new ExportAccessPolicy { PolicyName = "C1" } } },
                new ExportFieldDefinition { Name = "Age", AccessPolicies = new() { new ExportAccessPolicy { PolicyName = "C2" } } }
            }
        };

        var policies = doc.MapToClsPolicies("s1", "Person");

        policies.Should().HaveCount(2);
        policies.First(p => p.PolicyName == "C1").FieldNames.Should().BeEquivalentTo(new[] { "Email", "Phone" });
    }

    [Fact]
    public void MapToValidationRule_ConvertsValues()
    {
        var rule = new ExportValidationRule
        {
            Type = ValidationType.Range,
            Value = System.Text.Json.JsonDocument.Parse("1").RootElement,
            SecondaryValue = System.Text.Json.JsonDocument.Parse("10").RootElement,
            IsActive = true
        };

        var entity = rule.MapToValidationRule();

        entity.Value.Should().Be(1L);
        entity.SecondaryValue.Should().Be(10L);
    }
}
