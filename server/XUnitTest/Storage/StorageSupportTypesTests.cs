using System.Net;
using Blocks.Genesis;
using DomainService.Configuration;
using DomainService.Storage;
using FluentAssertions;
using Storage.DomainService.Dtos;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Storage;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the small support types the storage layer is built out of: the fluent DMS response
/// builder, the storage-strategy lookup, the queue configuration the host registers, the parent
/// artifact validation shared by the artifact builders, and the response shapes whose defaults
/// callers depend on.
/// </summary>
public class StorageSupportTypesTests
{
    // ---------------- DmsResponse ----------------

    [Fact]
    public void ResponseBuild_StartsFromAnEmptyResponse()
    {
        var response = Response.Build();

        response.Should().NotBeNull();
        ((object?)response.Result).Should().BeNull();
        response.Message.Should().BeNull();
        response.HttpStatusCode.Should().Be(default(HttpStatusCode));
    }

    [Fact]
    public void DmsResponse_BuilderMethodsChainAndReturnTheSameInstance()
    {
        var response = Response.Build();

        var chained = response
            .WithMessage("created")
            .WithResult(new { ItemId = "artifact-1" })
            .WithStatusCode(HttpStatusCode.Created);

        chained.Should().BeSameAs(response);
        response.Message.Should().Be("created");
        response.HttpStatusCode.Should().Be(HttpStatusCode.Created);
        ((object)response.Result).Should().NotBeNull();
    }

    [Fact]
    public void DmsResponse_LastWriteWinsForEachSlot()
    {
        var response = Response.Build()
            .WithStatusCode(HttpStatusCode.OK)
            .WithMessage("first")
            .WithMessage("second")
            .WithStatusCode(HttpStatusCode.BadRequest);

        response.Message.Should().Be("second");
        response.HttpStatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ---------------- StorageTypes ----------------

    [Theory]
    [InlineData("azure", StorageStrategyCategory.Cloud)]
    [InlineData("AZURE", StorageStrategyCategory.Cloud)]
    [InlineData("aws", StorageStrategyCategory.Cloud)]
    [InlineData("SftpStorage", StorageStrategyCategory.Local)]
    public void TryGetCategory_ResolvesTheKnownStrategiesCaseInsensitively(
        string type,
        StorageStrategyCategory expected)
    {
        StorageTypes.TryGetCategory(type, out var category).Should().BeTrue();
        category.Should().Be(expected);
    }

    [Theory]
    [InlineData("gcs")]
    [InlineData("")]
    public void TryGetCategory_ReportsAnUnknownStrategy(string type)
    {
        StorageTypes.TryGetCategory(type, out var category).Should().BeFalse();
        category.Should().Be(default(StorageStrategyCategory));
    }

    // ---------------- Constants ----------------

    [Fact]
    public void GetMessageConfiguration_RegistersTheServiceQueueAndNoTopics()
    {
        var configuration = Constants.GetMessageConfiguration();

        configuration.AzureServiceBusConfiguration.Should().NotBeNull();
        configuration.AzureServiceBusConfiguration.Queues.Should().Equal(Constants.ServiceQueue);
        configuration.AzureServiceBusConfiguration.Topics.Should().BeEmpty();
    }

    [Fact]
    public void ServiceNames_AreTheStableExternallyVisibleIdentifiers()
    {
        Constants.ServiceQueue.Should().Be("blocks-storage-queue");
        Constants.ApiServiceName.Should().Be("blocks-storage-api");
        Constants.WorkerServiceName.Should().Be("blocks-storage-worker");
        Constants.DefaultConfigurationName.Should().Be("Default");
        Constants.CertificateCollectionName.Should().Be("certificates");
        Constants.StorageTopicName.Should().Be("blocks-storage-topic");
        Constants.StorageQueueName.Should().Be("blocks_storage_listener");
    }

    // ---------------- response and request shapes ----------------

    [Fact]
    public void FileResponse_CarriesTheDownloadShapeCallersReadBackFromTheApi()
    {
        var created = new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc);
        var response = new FileResponse
        {
            ItemId = "file-1",
            Url = "https://cdn/file-1",
            AccessModifier = AccessModifier.Public,
            Tags = ["a", "b"],
            MetaData = new Dictionary<string, FileMetaDataResponse>
            {
                ["author"] = new() { Type = "String", Value = "Ada" }
            },
            Name = "a.txt",
            ParentDirectoryID = "dir-1",
            SystemName = "a-1.txt",
            Type = 1,
            TypeString = "File",
            CreatedDate = created,
            CreatedBy = "user-1",
            Language = "en",
            TenantId = "tenant-1",
            SizeInBytes = 42,
            IsSuccess = true
        };

        response.ItemId.Should().Be("file-1");
        response.Url.Should().Be("https://cdn/file-1");
        response.AccessModifier.Should().Be(AccessModifier.Public);
        response.Tags.Should().Equal("a", "b");
        response.MetaData["author"].Value.Should().Be("Ada");
        response.Name.Should().Be("a.txt");
        response.ParentDirectoryID.Should().Be("dir-1");
        response.SystemName.Should().Be("a-1.txt");
        response.Type.Should().Be(1);
        response.TypeString.Should().Be("File");
        response.CreatedDate.Should().Be(created);
        response.CreatedBy.Should().Be("user-1");
        response.Language.Should().Be("en");
        response.TenantId.Should().Be("tenant-1");
        response.SizeInBytes.Should().Be(42);
        response.IsSuccess.Should().BeTrue();
        FileResponse.Exists.Should().BeTrue();
    }

    [Fact]
    public void GetFile_DefaultsAdditionalPropertiesToAnEmptyDictionary()
    {
        var file = new GetFile
        {
            ItemId = "file-1",
            Url = "https://cdn/file-1",
            TenantId = "tenant-1",
            AccessModifier = AccessModifier.Private,
            Name = "a.txt",
            SystemName = "a-1.txt",
            Type = StructureType.File,
            TypeString = "File",
            CurrentVersion = 3
        };

        file.AdditionalProperties.Should().BeEmpty();
        file.MetaData.Should().BeNull();
        file.ParentDirectoryID.Should().BeNull();
        file.CurrentVersion.Should().Be(3);
        file.Type.Should().Be(StructureType.File);
    }

    [Fact]
    public void DownloadFileResponse_DefaultsToNoStream()
    {
        var response = new DownloadFileResponse { FileName = "a.txt", FileId = "file-1", FileVersion = 2 };

        response.FileStream.Should().BeNull();
        response.IsSuccess.Should().BeFalse();
        response.FileVersion.Should().Be(2);
    }

    [Fact]
    public void LocalStorageUploadRequest_DefaultsToAPrivateUploadWithNoConfiguration()
    {
        var request = new LocalStorageUploadRequest { File = null! };

        request.AccessModifier.Should().Be("Private");
        request.ConfigurationName.Should().BeNull();
        request.AdditionalProperties.Should().BeEmpty();
        request.ItemId.Should().BeNull();
    }

    [Fact]
    public void DownloadUrlRequest_CarriesTheSigningInputs()
    {
        var request = new DownloadUrlRequest
        {
            ItemId = "file-1",
            FileName = "a.txt",
            ConfigurationName = "Default",
            ExpiryDuration = TimeSpan.FromMinutes(15),
            AccessModifier = AccessModifier.Private,
            FileVersion = 3,
            ProjectKey = "project-1",
            RequestUrl = "https://api/files"
        };

        request.ItemId.Should().Be("file-1");
        request.FileName.Should().Be("a.txt");
        request.ConfigurationName.Should().Be("Default");
        request.ExpiryDuration.Should().Be(TimeSpan.FromMinutes(15));
        request.AccessModifier.Should().Be(AccessModifier.Private);
        request.FileVersion.Should().Be(3);
        request.ProjectKey.Should().Be("project-1");
        request.RequestUrl.Should().Be("https://api/files");
    }

    [Fact]
    public void SignatureString_CarriesTheSignedDownloadClaim()
    {
        var signature = new SignatureString
        {
            ItemId = "file-1",
            FileVersion = 2,
            ConfiguratioName = "Default",
            AccessModifier = "Private",
            ProjectKey = "project-1",
            ExpiryUtc = "2026-07-30T09:00:00Z"
        };

        signature.ItemId.Should().Be("file-1");
        signature.FileVersion.Should().Be(2);
        signature.ConfiguratioName.Should().Be("Default");
        signature.AccessModifier.Should().Be("Private");
        signature.ProjectKey.Should().Be("project-1");
        signature.ExpiryUtc.Should().Be("2026-07-30T09:00:00Z");
    }

    [Fact]
    public void Configuration_IsAProjectScopedStorageStrategyRecord()
    {
        var configuration = new Configuration
        {
            Name = "Default",
            ConnectionString = "UseDevelopmentStorage=true",
            SecretKey = "secret",
            AccessKey = "access",
            StorageStrategy = "azure",
            CloudStorageRegionEndPoint = "eu-west-1",
            ProjectKey = "project-1",
            UpdateRequest = true,
            ItemId = "config-1",
            Host = "sftp.test",
            Port = "22",
            UserName = "blocks",
            Password = "pw",
            RemoteBasePath = "/upload"
        };

        configuration.Should().BeAssignableTo<IProjectKey>();
        configuration.Name.Should().Be("Default");
        configuration.ConnectionString.Should().Be("UseDevelopmentStorage=true");
        configuration.SecretKey.Should().Be("secret");
        configuration.AccessKey.Should().Be("access");
        configuration.StorageStrategy.Should().Be("azure");
        configuration.CloudStorageRegionEndPoint.Should().Be("eu-west-1");
        configuration.ProjectKey.Should().Be("project-1");
        configuration.UpdateRequest.Should().BeTrue();
        configuration.ItemId.Should().Be("config-1");
        configuration.Host.Should().Be("sftp.test");
        configuration.Port.Should().Be("22");
        configuration.UserName.Should().Be("blocks");
        configuration.Password.Should().Be("pw");
        configuration.RemoteBasePath.Should().Be("/upload");
    }
}
