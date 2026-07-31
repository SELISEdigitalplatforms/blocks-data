using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using FluentAssertions;
using HotChocolate;

namespace XUnitTest.DataGateway;

/// <summary>
/// Contract tests for the model shapes the gateway serialises across a boundary: the GraphQL filter
/// inputs (where an omitted field must stay omitted rather than defaulting), the pipeline and
/// instance records the deployment worker writes, the data change event payload, and the pagination
/// maths on the query response.
/// </summary>
public class DataGatewayContractTests
{
    // ---------------- operation filter inputs ----------------

    [Fact]
    public void StringFilter_LeavesEveryOperatorUnsetUntilItIsAssigned()
    {
        var filter = new StringOperationFilterInput();

        filter.Eq.HasValue.Should().BeFalse();
        filter.Neq.HasValue.Should().BeFalse();
        filter.Contains.HasValue.Should().BeFalse();
        filter.StartsWith.HasValue.Should().BeFalse();
        filter.EndsWith.HasValue.Should().BeFalse();
        filter.In.HasValue.Should().BeFalse();
    }

    [Fact]
    public void StringFilter_DistinguishesAnExplicitNullFromAnOmittedOperator()
    {
        // This is the whole point of Optional<T>: "Eq: null" is a real filter, an absent Eq is not.
        var filter = new StringOperationFilterInput { Eq = new Optional<string?>(null) };

        filter.Eq.HasValue.Should().BeTrue();
        filter.Eq.Value.Should().BeNull();
        filter.Neq.HasValue.Should().BeFalse();
    }

    [Fact]
    public void StringFilter_RoundTripsEveryOperator()
    {
        var filter = new StringOperationFilterInput
        {
            Eq = "a",
            Neq = "b",
            Contains = "c",
            StartsWith = "d",
            EndsWith = "e",
            In = new[] { "f", "g" }
        };

        filter.Eq.Value.Should().Be("a");
        filter.Neq.Value.Should().Be("b");
        filter.Contains.Value.Should().Be("c");
        filter.StartsWith.Value.Should().Be("d");
        filter.EndsWith.Value.Should().Be("e");
        filter.In.Value.Should().BeEquivalentTo(new[] { "f", "g" });
    }

    [Fact]
    public void NumberFilter_RoundTripsEveryOperator()
    {
        var filter = new NumberOperationFilterInput
        {
            Eq = 1.5,
            Neq = 2.5,
            Gt = 3.5,
            Gte = 4.5,
            Lt = 5.5,
            Lte = 6.5,
            In = new[] { 7.5 }
        };

        filter.Eq.Value.Should().Be(1.5);
        filter.Neq.Value.Should().Be(2.5);
        filter.Gt.Value.Should().Be(3.5);
        filter.Gte.Value.Should().Be(4.5);
        filter.Lt.Value.Should().Be(5.5);
        filter.Lte.Value.Should().Be(6.5);
        filter.In.HasValue.Should().BeTrue();
    }

    [Fact]
    public void IntFilter_RoundTripsEveryOperator()
    {
        var filter = new IntOperationFilterInput
        {
            Eq = 1,
            Neq = 2,
            Gt = 3,
            Gte = 4,
            Lt = 5,
            Lte = 6,
            In = new[] { 7 }
        };

        filter.Eq.Value.Should().Be(1);
        filter.Neq.Value.Should().Be(2);
        filter.Gt.Value.Should().Be(3);
        filter.Gte.Value.Should().Be(4);
        filter.Lt.Value.Should().Be(5);
        filter.Lte.Value.Should().Be(6);
        filter.In.HasValue.Should().BeTrue();
    }

    [Fact]
    public void BooleanFilter_OnlySupportsEqualityAndInequality()
    {
        var filter = new BooleanOperationFilterInput { Eq = true, Neq = false };

        filter.Eq.Value.Should().BeTrue();
        filter.Neq.Value.Should().BeFalse();
        typeof(BooleanOperationFilterInput).GetProperty("Gt").Should().BeNull();
        typeof(BooleanOperationFilterInput).GetProperty("In").Should().BeNull();
    }

    [Fact]
    public void DateTimeFilter_RoundTripsEveryOperator()
    {
        var now = new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc);
        var filter = new DateTimeOperationFilterInput
        {
            Eq = now,
            Neq = now.AddDays(1),
            Gt = now.AddDays(2),
            Gte = now.AddDays(3),
            Lt = now.AddDays(4),
            Lte = now.AddDays(5),
            In = new[] { now }
        };

        filter.Eq.Value.Should().Be(now);
        filter.Neq.Value.Should().Be(now.AddDays(1));
        filter.Gt.Value.Should().Be(now.AddDays(2));
        filter.Gte.Value.Should().Be(now.AddDays(3));
        filter.Lt.Value.Should().Be(now.AddDays(4));
        filter.Lte.Value.Should().Be(now.AddDays(5));
        filter.In.HasValue.Should().BeTrue();
    }

    // ---------------- pagination ----------------

    [Fact]
    public void PaginationRequest_DefaultsToTheFirstPageOfTen()
    {
        var request = new BasePaginationRequest();

        request.PageNo.Should().Be(1);
        request.PageSize.Should().Be(10);
        request.SortBy.Should().Be("Id");
        request.SortDescending.Should().BeFalse();
    }

    [Fact]
    public void PaginationRequest_TakesEveryValueFromTheExplicitConstructor()
    {
        var request = new BasePaginationRequest(3, 25, "CreatedDate", true);

        request.PageNo.Should().Be(3);
        request.PageSize.Should().Be(25);
        request.SortBy.Should().Be("CreatedDate");
        request.SortDescending.Should().BeTrue();
    }

    [Theory]
    [InlineData(0, 10, 0)]
    [InlineData(10, 10, 1)]
    [InlineData(11, 10, 2)]
    [InlineData(25, 10, 3)]
    public void QueryResponse_RoundsTheTotalPageCountUp(int totalCount, int pageSize, int expectedPages)
    {
        var response = new QueryResponse<string> { TotalCount = totalCount, PageSize = pageSize };

        response.TotalPages.Should().Be(expectedPages);
    }

    [Fact]
    public void QueryResponse_ReportsNoPagesRatherThanDividingByZero()
    {
        var response = new QueryResponse<string> { TotalCount = 5, PageSize = 0 };

        response.TotalPages.Should().Be(0);
        response.HasNextPage.Should().BeFalse();
    }

    [Fact]
    public void QueryResponse_ReportsTheNeighbouringPages()
    {
        var middle = new QueryResponse<string> { TotalCount = 30, PageSize = 10, PageNo = 2 };
        middle.HasNextPage.Should().BeTrue();
        middle.HasPreviousPage.Should().BeTrue();

        var first = new QueryResponse<string> { TotalCount = 30, PageSize = 10, PageNo = 1 };
        first.HasNextPage.Should().BeTrue();
        first.HasPreviousPage.Should().BeFalse();

        var last = new QueryResponse<string> { TotalCount = 30, PageSize = 10, PageNo = 3 };
        last.HasNextPage.Should().BeFalse();
        last.HasPreviousPage.Should().BeTrue();
    }

    [Fact]
    public void QueryResponse_DefaultsToAnEmptyPageWithNoMessage()
    {
        var response = new QueryResponse<string>();

        response.Items.Should().BeEmpty();
        response.Message.Should().BeNull();
    }

    // ---------------- data change event ----------------

    [Fact]
    public void DataChangeEvent_StampsItselfWithTheCurrentTimeAndCarriesInsertedDocuments()
    {
        var before = DateTime.UtcNow;
        var changeEvent = new DataChangeEvent
        {
            ProjectKey = "project-1",
            CollectionName = "Persons",
            SchemaName = "Person",
            Operation = DataChangeOperation.Inserted,
            Data = [new Dictionary<string, object?> { ["_id"] = "1", ["Name"] = "Ada" }]
        };

        changeEvent.Timestamp.Should().BeOnOrAfter(before);
        changeEvent.ProjectKey.Should().Be("project-1");
        changeEvent.CollectionName.Should().Be("Persons");
        changeEvent.SchemaName.Should().Be("Person");
        changeEvent.Operation.Should().Be(DataChangeOperation.Inserted);
        changeEvent.Data.Should().ContainSingle();
        changeEvent.UpdatedDocuments.Should().BeNull();
    }

    [Fact]
    public void UpdatedDocument_CarriesThePerFieldBeforeAndAfterValues()
    {
        var document = new UpdatedDocument
        {
            DocumentId = "1",
            UpdatedFields =
            [
                new FieldChange { FieldName = "Name", OldValue = "Ada", NewValue = "Grace" },
                new FieldChange { FieldName = "Note", OldValue = null, NewValue = "added" }
            ]
        };

        document.DocumentId.Should().Be("1");
        document.UpdatedFields.Should().HaveCount(2);
        document.UpdatedFields[0].OldValue.Should().Be("Ada");
        document.UpdatedFields[0].NewValue.Should().Be("Grace");
        document.UpdatedFields[1].OldValue.Should().BeNull();
    }

    [Fact]
    public void UpdatedDocument_DefaultsToNoChangedFields()
        => new UpdatedDocument().UpdatedFields.Should().BeEmpty();

    // ---------------- deployment records ----------------

    [Fact]
    public void DataGatewayInstanceEntity_CarriesTheDeploymentLog()
    {
        var start = new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc);
        var instance = new global::DataGateway.DomainService.Entities.DataGatewayInstance
        {
            TenantId = "tenant-1",
            ProjectGuid = "guid-1",
            ProjectEnv = "dev",
            LastPipelineRunName = "run-9",
            LastVersion = "1.2.3",
            LastDeploymentStatus = "Succeeded",
            ClusterNames = ["cluster-a", "cluster-b"],
            DataGatewayInstanceDeploymentLog =
            [
                new DataGatewayInstanceDeploymentLogs
                {
                    PipelineRunName = "run-9",
                    EventStartDate = start,
                    EventFinishDate = start.AddMinutes(4),
                    EventStatus = "Succeeded",
                    Version = "1.2.3"
                }
            ]
        };

        instance.TenantId.Should().Be("tenant-1");
        instance.ProjectGuid.Should().Be("guid-1");
        instance.ProjectEnv.Should().Be("dev");
        instance.LastPipelineRunName.Should().Be("run-9");
        instance.LastVersion.Should().Be("1.2.3");
        instance.LastDeploymentStatus.Should().Be("Succeeded");
        instance.ClusterNames.Should().Equal("cluster-a", "cluster-b");
        instance.DataGatewayInstanceDeploymentLog.Should().ContainSingle();
        instance.DataGatewayInstanceDeploymentLog[0].PipelineRunName.Should().Be("run-9");
        instance.DataGatewayInstanceDeploymentLog[0].EventStartDate.Should().Be(start);
        instance.DataGatewayInstanceDeploymentLog[0].EventFinishDate.Should().Be(start.AddMinutes(4));
        instance.DataGatewayInstanceDeploymentLog[0].EventStatus.Should().Be("Succeeded");
        instance.DataGatewayInstanceDeploymentLog[0].Version.Should().Be("1.2.3");
    }

    [Fact]
    public void DataGatewayInstanceModel_StampsItsOwnCreationTimeAndDefaultsToEmptyStrings()
    {
        var before = DateTime.UtcNow;
        var model = new global::DataGateway.DomainService.Models.DataGatewayInstance();

        model.CreatedAt.Should().BeOnOrAfter(before);
        model.TenantId.Should().BeEmpty();
        model.ProjectName.Should().BeEmpty();
        model.ProjectGuidId.Should().BeEmpty();
        model.PipelineRunName.Should().BeEmpty();
        model.Environment.Should().BeEmpty();
    }

    [Fact]
    public void PostBuildQueue_DefaultsToAnUnnamedProject()
    {
        var queued = new PostBuildQueue
        {
            ProjectKey = "project-1",
            PipelineRunName = "run-9"
        };

        queued.ProjectKey.Should().Be("project-1");
        queued.PipelineRunName.Should().Be("run-9");
        new PostBuildQueue().ProjectKey.Should().BeEmpty();
        new PostBuildQueue().PipelineRunName.Should().BeEmpty();
    }

    [Fact]
    public void PipelineRunStatus_DefaultsToNoTaskRuns()
    {
        var status = new PipelineRunStatus();

        status.TaskRuns.Should().BeEmpty();
        status.Status.Should().BeNull();
        status.Reason.Should().BeNull();
    }

    [Fact]
    public void PipelineRunStatus_CarriesItsTaskRuns()
    {
        var status = new PipelineRunStatus
        {
            Status = "Succeeded",
            Reason = "Completed",
            TaskRuns = [new TaskRunInfo { Name = "run-9-build", TaskName = "build", Status = "Succeeded" }]
        };

        status.Status.Should().Be("Succeeded");
        status.Reason.Should().Be("Completed");
        status.TaskRuns.Should().ContainSingle();
        status.TaskRuns[0].Name.Should().Be("run-9-build");
        status.TaskRuns[0].TaskName.Should().Be("build");
        status.TaskRuns[0].Status.Should().Be("Succeeded");
    }

    [Fact]
    public void TaskRunStatus_DefaultsToUnknown()
    {
        var status = new TaskRunStatus();

        status.Status.Should().Be("Unknown");
        status.PodName.Should().BeNull();
    }

    [Fact]
    public void TaskLogs_DefaultToNoStepsAndCarryThemOnceAssigned()
    {
        new TaskLogs().Steps.Should().BeEmpty();

        var logs = new TaskLogs
        {
            TaskRunName = "run-9-build",
            PodName = "pod-1",
            Status = "Succeeded",
            Steps = new Dictionary<string, string> { ["build"] = "ok" }
        };

        logs.TaskRunName.Should().Be("run-9-build");
        logs.PodName.Should().Be("pod-1");
        logs.Status.Should().Be("Succeeded");
        logs.Steps["build"].Should().Be("ok");
    }

    // ---------------- mutation audit record ----------------

    [Fact]
    public void DataMutationRecord_DefaultsToTheLatestRevisionWithEmptyIdentifiers()
    {
        var record = new DataMutationRecord { Record = new { Name = "Ada" } };

        record.IsLatest.Should().BeTrue();
        record.CollectionName.Should().BeEmpty();
        record.SchemaName.Should().BeEmpty();
        record.SchemaId.Should().BeEmpty();
        record.RecordItemId.Should().BeEmpty();
        record.Operation.Should().BeEmpty();
    }

    [Fact]
    public void DataMutationRecord_CarriesTheArchivedRevision()
    {
        var record = new DataMutationRecord
        {
            CollectionName = "Persons",
            SchemaName = "Person",
            SchemaId = "schema-1",
            RecordItemId = "person-1",
            Operation = "Updated",
            IsLatest = false,
            Record = new { Name = "Ada" }
        };

        record.CollectionName.Should().Be("Persons");
        record.SchemaName.Should().Be("Person");
        record.SchemaId.Should().Be("schema-1");
        record.RecordItemId.Should().Be("person-1");
        record.Operation.Should().Be("Updated");
        record.IsLatest.Should().BeFalse();
        ((object)record.Record).Should().NotBeNull();
    }

    // ---------------- guid mapping ----------------

    [Fact]
    public void BlocksGuid_CarriesTheEncodedProjectIdentifier()
    {
        var guid = new BlocksGuid
        {
            ItemId = "guid-1",
            TenantGroupId = "group-1",
            OriginalValue = "project-1",
            EncodedValue = "p1"
        };

        guid.ItemId.Should().Be("guid-1");
        guid.TenantGroupId.Should().Be("group-1");
        guid.OriginalValue.Should().Be("project-1");
        guid.EncodedValue.Should().Be("p1");
    }
}
