using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Models;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using FluentAssertions;
using MongoDB.Bson;

namespace XUnitTest.DataAccess;

/// <summary>
/// Published schema snapshots are BSON produced by the Mongo class maps of the entities. Moving the
/// entities to Blocks.DataAccess must not change that format: a policy with a typed StaticValue has to
/// round-trip through Pack/Unpack exactly as before, and the collection-name convention must hold.
/// </summary>
public class SnapshotBsonCompatibilityTests
{
    [Fact]
    public void Pack_Unpack_RoundTripsDataAccessPolicyWithStaticValue()
    {
        var policy = new DataAccessPolicy
        {
            ItemId = "pol-1",
            SchemaId = "sch-1",
            SchemaName = "Order",
            PolicyName = "Own rows",
            PolicyType = PolicyType.RLS,
            Operation = PolicyOperation.READ,
            Priority = 2,
            IsAllowPolicy = true,
            RuleGroup = new PolicyRuleGroup
            {
                LogicalOperator = PolicyLogicalOperator.OR,
                Rules =
                [
                    new PolicyRule
                    {
                        LeftSource = ConditionSource.SCHEMA_FIELD,
                        LeftOperand = "CreatedBy",
                        Operator = PolicyOperator.EQUAL,
                        RightSource = ConditionSource.AUTH,
                        RightOperand = "userId"
                    },
                    new PolicyRule
                    {
                        LeftSource = ConditionSource.AUTH,
                        LeftOperand = "roles",
                        Operator = PolicyOperator.IN,
                        RightSource = ConditionSource.STATIC_VALUE,
                        StaticValue = new[] { "admin", "hr" }
                    },
                    new PolicyRule
                    {
                        LeftSource = ConditionSource.SCHEMA_FIELD,
                        LeftOperand = "Amount",
                        Operator = PolicyOperator.GREATER_THAN,
                        RightSource = ConditionSource.STATIC_VALUE,
                        StaticValue = 42
                    }
                ]
            }
        };
        var source = new SchemaSource { DataAccessPolicies = [policy] };

        var content = SchemaSnapshotStore.Pack(source);
        var restored = SchemaSnapshotStore.Unpack(content.CompressedBytes);

        var restoredPolicy = restored.DataAccessPolicies.Should().ContainSingle().Subject;
        restoredPolicy.ItemId.Should().Be("pol-1");
        restoredPolicy.PolicyType.Should().Be(PolicyType.RLS);
        restoredPolicy.Operation.Should().Be(PolicyOperation.READ);
        restoredPolicy.Priority.Should().Be(2);
        restoredPolicy.RuleGroup.LogicalOperator.Should().Be(PolicyLogicalOperator.OR);
        restoredPolicy.RuleGroup.Rules.Should().HaveCount(3);
        restoredPolicy.RuleGroup.Rules[1].StaticValue.Should().BeEquivalentTo(new[] { "admin", "hr" });
        restoredPolicy.RuleGroup.Rules[2].StaticValue.Should().Be(42);
    }

    [Fact]
    public void PolicyEnums_AreStoredAsStrings_AsBefore()
    {
        var doc = new DataAccessPolicy { PolicyType = PolicyType.CLS, Operation = PolicyOperation.EDIT }.ToBsonDocument();

        doc["PolicyType"].Should().Be(BsonString.Create("CLS"));
        doc["Operation"].Should().Be(BsonString.Create("EDIT"));
    }

    [Fact]
    public void MovedEntities_KeepTheirCollectionNames()
    {
        // DbRepository names collections typeof(T).Name + "s"; the namespace move must not touch the type names.
        (typeof(DataAccessPolicy).Name + "s").Should().Be("DataAccessPolicys");
        (typeof(SchemaDefinition).Name + "s").Should().Be("SchemaDefinitions");
        (typeof(PublishedSchemaSnapshot).Name + "s").Should().Be("PublishedSchemaSnapshots");
        typeof(DataAccessPolicy).Namespace.Should().Be("Blocks.DataAccess.Entities");
    }
}
