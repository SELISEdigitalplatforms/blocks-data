using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Blocks.Genesis;
using DomainService.Configuration;
using DomainService.Storage;
using DomainService.Storage.Dms;
using FluentValidation;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Dtos;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Storage;
using Storage.DomainService.Utilities;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Net;
using System.Text.Json;
using File = Storage.DomainService.Entities.File;
using Response = Storage.DomainService.Storage.Response;

namespace Storage.DomainService.Services
{
    [ExcludeFromCodeCoverage]
    public class FileManagementService : IFileManagementService
    {
        private readonly IConfigurationRepository _configurationRepository;
        private readonly IFileRepository _fileRepository;
        private readonly IFileVersionRepository _versionRepository;
        private readonly IStorageServiceFactory _storageServiceFactory;
        private readonly IDirectoryRepository _directoryRepository;
        private readonly IValidator<GetPreSignedUrlForUploadRequest> _requestValidator;
        private readonly IValidator<LocalStorageUploadRequest> _localStorageRequestValidator;
        private readonly IValidator<UpdateFileRequest> _fileRequestValidator;
        private readonly IMessageClient _messageClient;

        private const string ConfigurationNotFound = "configuration_not_found";

        public FileManagementService(
            IFileRepository fileRepository,
            IStorageServiceFactory storageServiceFactory,
            IFileVersionRepository versionRepository,
            IConfigurationRepository configurationRepository,
            IDirectoryRepository directoryRepository,
            IValidator<GetPreSignedUrlForUploadRequest> requestValidator,
            IValidator<LocalStorageUploadRequest> localStorageRequestValidator,
            IValidator<UpdateFileRequest> fileRequestValidator,
            IMessageClient messageClient
            )
        {
            _fileRepository = fileRepository;
            _storageServiceFactory = storageServiceFactory;
            _versionRepository = versionRepository;
            _configurationRepository = configurationRepository;
            _directoryRepository = directoryRepository;
            _requestValidator = requestValidator;
            _localStorageRequestValidator = localStorageRequestValidator;
            _fileRequestValidator = fileRequestValidator;
            _messageClient = messageClient;
        }


        public async Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request)
        {
            var validationResult = await ValidateRequestAsync(request);

            if (!validationResult.IsSuccess)
                return validationResult;

            request.ItemId = string.IsNullOrEmpty(request.ItemId) ? Guid.NewGuid().ToString() : request.ItemId;
            var existingFile = await _fileRepository.GetFileByItemIdAsync(request.ItemId);
            return existingFile != null
                ? await HandleExistingFileAsync(request, existingFile)
                : await HandleNewFileAsync(request);
        }

        private async Task<GetPreSignedUrlForUploadResponse> ValidateRequestAsync(GetPreSignedUrlForUploadRequest request)
        {
            var validationResult = await _requestValidator.ValidateAsync(request);
            if (!validationResult.IsValid)
            {
                return new GetPreSignedUrlForUploadResponse
                {
                    Errors = validationResult.Errors.ToDictionary(e => e.PropertyName, e => e.ErrorMessage),
                    IsSuccess = false
                };
            }

            if (!Path.HasExtension(request.Name))
            {
                return new GetPreSignedUrlForUploadResponse
                {
                    UploadUrl = "File name does not have any extension",
                    FileId = request.ItemId,
                    IsSuccess = false
                };
            }

            var fileExtension = Path.GetExtension(request.Name).ToLower();

            if (UnsupportedFile.Extensions.Contains(fileExtension))
            {
                return new GetPreSignedUrlForUploadResponse
                {
                    UploadUrl = $"File extension {fileExtension} is not supported",
                    FileId = request.ItemId,
                    IsSuccess = false
                };
            }

            if (!string.IsNullOrEmpty(request.ParentDirectoryId))
            {
                var directory = await _directoryRepository.GetDirectoryByItemIDAsync(request.ParentDirectoryId);
                if (directory?.AllowedFileExtensions?.Any() == true && !directory.AllowedFileExtensions.Contains(fileExtension))
                {
                    return new GetPreSignedUrlForUploadResponse
                    {
                        UploadUrl = $"File extension {fileExtension} is not supported for this directory",
                        FileId = request.ItemId,
                        IsSuccess = false
                    };
                }
            }

            return new GetPreSignedUrlForUploadResponse { IsSuccess = true };
        }

        private async Task<GetPreSignedUrlForUploadResponse> HandleExistingFileAsync(GetPreSignedUrlForUploadRequest request, File existingFile)
        {
            var latestFileVersionNumber = await _versionRepository.GetLatestFileVersionNumberAsync(existingFile.ItemId);
            var newFileVersion = CreateNewFileVersion(existingFile.ItemId, latestFileVersionNumber);

            var configuration = await GetConfigurationAsync(request.ConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<GetPreSignedUrlForUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var storageServiceProvider = GetStorageService(configuration);

            var fileInfo = GetFileInfo(existingFile.ItemId, newFileVersion.ItemId, existingFile.Name, existingFile.AccessModifier, StorageStrategyCategory.Cloud);
            var preSignedUrl = storageServiceProvider.GeneratePreSignedUploadUrlAsync(fileInfo.filePath, fileInfo.expiry);

            await Task.WhenAll(_versionRepository.CreateFileVersionAsync(newFileVersion));

            return new GetPreSignedUrlForUploadResponse
            {
                UploadUrl = preSignedUrl,
                FileId = existingFile.ItemId,
                IsSuccess = true
            };
        }

        private async Task<GetPreSignedUrlForUploadResponse> HandleNewFileAsync(GetPreSignedUrlForUploadRequest request)
        {
            var file = CreateNewFile(request);
            var fileVersion = CreateNewFileVersion(file.ItemId, 0);
            var configuration = await GetConfigurationAsync(request.ConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<GetPreSignedUrlForUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var storageServiceProvider = GetStorageService(configuration);

            var fileInfo = GetFileInfo(file.ItemId, fileVersion.ItemId, file.Name, file.AccessModifier, StorageStrategyCategory.Cloud);
            var preSignedUrl = storageServiceProvider.GeneratePreSignedUploadUrlAsync(fileInfo.filePath, TimeSpan.FromDays(3));

            file.Url = preSignedUrl;

            await Task.WhenAll(_fileRepository.CreateFileAsync(file),
                               _versionRepository.CreateFileVersionAsync(fileVersion));

            return new GetPreSignedUrlForUploadResponse
            {
                UploadUrl = preSignedUrl,
                FileId = file.ItemId,
                IsSuccess = true
            };
        }

        private async Task<StorageConfiguration> GetConfigurationAsync(string? configurationName)
        {
            return await _configurationRepository.GetConfigurationByNameAsync(configurationName ?? Constants.DefaultConfigurationName);
        }

        private IStorageService GetStorageService(StorageConfiguration configuration)
        {
            return _storageServiceFactory.GetStorageService(configuration);
        }

        private File CreateNewFile(dynamic request)
        {
            var now = DateTime.UtcNow;
            var userId = BlocksContext.GetContext()?.UserId ?? string.Empty;

            var tags = ParseTags(request.Tags);


            var meta = string.IsNullOrWhiteSpace(request.MetaData)
                ? new Dictionary<string, MetaValue>()
                : JsonSerializer.Deserialize<Dictionary<string, MetaValue>>(request.MetaData) ?? new Dictionary<string, MetaValue>();

            return new File
            {
                Name = request.Name,
                DirectoryId = string.IsNullOrWhiteSpace(request.ParentDirectoryId) ? string.Empty : request.ParentDirectoryId,
                SystemName = request.Name.ToLower(),
                Type = StructureType.File,
                TypeString = StructureType.File.ToString(),
                MetaData = meta,
                Url = string.Empty,
                ItemId = request.ItemId,
                TenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty,
                CreatedDate = now,
                CreatedBy = userId,
                // A fresh upload is also the initial version of this file, not an
                // update after creation. Persist the same timestamp for both fields.
                LastUpdatedDate = now,
                LastUpdatedBy = userId,
                Tags = tags,
                Language = "EN",
                AccessModifier = string.IsNullOrWhiteSpace(request.AccessModifier)
                    ? AccessModifier.Private
                    : Enum.Parse<AccessModifier>(request.AccessModifier),
                CurrentVersion = 0,
                AdditionalProperties = request.AdditionalProperties ?? new Dictionary<string, string>(),
            };
        }

        private static List<string> ParseTags(string? tags)
        {
            if (string.IsNullOrWhiteSpace(tags))
                return new List<string>();

            var trimmedTags = tags.Trim();

            // Upload clients historically send a JSON array (for example, ["tag-1"]),
            // while some callers provide one tag as plain text. Treat plain text as one
            // tag instead of attempting to deserialize it as JSON.
            if (!trimmedTags.StartsWith("[", StringComparison.Ordinal))
                return new List<string> { trimmedTags };

            return JsonSerializer.Deserialize<List<string>>(trimmedTags) ?? new List<string>();
        }

        private FileVersion CreateNewFileVersion(string fileId, long versionNumber)
        {

            return FileVersion.CreateNew(
                fileId,
                versionNumber,
                new FileVersionOptions
                {
                    ItemId = Guid.NewGuid().ToString(),
                    TenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty,
                    CreateDate = DateTime.UtcNow,
                    CreatedBy = BlocksContext.GetContext()?.UserId ?? string.Empty,
                    Tags = null,
                    Language = "EN"
                });
        }

        public async Task<FileResponse?> GetUrlForDownloadFileAsync(GetFileRequest request)
        {
            if (string.IsNullOrEmpty(request.FileId))
            {
                return CreateErrorResponse<FileResponse>("empty_file_id", "file_id_should_not_be_empty");
            }

            var result = _fileRepository.GetRequiredFiles([request.FileId], request.Version);
            var configuration = await _configurationRepository.GetConfigurationByNameAsync(request.ConfigurationName ?? Constants.DefaultConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<FileResponse>("configuration", ConfigurationNotFound);
            }
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;

            var finalFileResponse = await GetFileResponse(result.Item1, result.Item2, configuration, tenantId);

            return finalFileResponse?.FirstOrDefault();
        }

        public async Task<List<FileResponse>?> GetMultipleUrlsForDownloadFilesAsync(GetFilesRequest request)
        {
            List<FileResponse>? finalfileResponse = new List<FileResponse>();

            if (!request.FileIds.Any())
            {
                finalfileResponse.Add(CreateErrorResponse<FileResponse>("empty_file_id", "file_id_should_not_be_empty"));
                return finalfileResponse;
            }

            var result = _fileRepository.GetRequiredFiles(request.FileIds, null);
            var configuration = await _configurationRepository.GetConfigurationByNameAsync(request.ConfigurationName ?? Constants.DefaultConfigurationName);

            if (configuration == null)
            {
                finalfileResponse.Add(CreateErrorResponse<FileResponse>("configuration", ConfigurationNotFound));
                return finalfileResponse;
            }
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;

            return await GetFileResponse(result.Item1, result.Item2, configuration, tenantId);
        }

        private async Task<List<FileResponse>?> GetFileResponse(IEnumerable<BsonDocument> bsonElements, FileResponse[] responses, StorageConfiguration configuration, string? projectKey)
        {
            List<FileResponse>? finalfileResponse = new List<FileResponse>();

            foreach (var fileVersionAggregate in bsonElements)
            {
                if (!fileVersionAggregate.Any()) { continue; }

                var fileId = fileVersionAggregate["_id"].AsString;
                var latestVersion = fileVersionAggregate["VersionId"].AsString;
                var latestVersionNo = fileVersionAggregate["MaxVersion"].IsBsonNull ? 0 : fileVersionAggregate["MaxVersion"].AsInt64;
                var fileResponse = responses.First(f => f.ItemId.Equals(fileId));

                var fileUrlResponse = await GetFileUrlResponse(configuration, projectKey, fileResponse, latestVersionNo, latestVersion);

                if (fileUrlResponse.Errors != null)
                {
                    finalfileResponse.Add(fileUrlResponse);
                    return finalfileResponse;
                }

                fileResponse.Url = fileUrlResponse.Url;

                fileResponse.SizeInBytes = fileVersionAggregate["SizeInBytes"].IsBsonNull ? 0 : fileVersionAggregate["SizeInBytes"].AsInt64;
                fileResponse.IsSuccess = true;

                finalfileResponse.Add(fileResponse);
            }

            return finalfileResponse;
        }

        private async Task<FileResponse> GetFileUrlResponse(StorageConfiguration configuration, string? projectKey, FileResponse fileResponse, long latestVersionNo, string latestVersion)
        {
            var storageServiceProvider = _storageServiceFactory.GetStorageService(configuration);

            DownloadUrlRequest fileUrlRequest = new DownloadUrlRequest
            {
                ItemId = fileResponse.ItemId,
                FileVersion = latestVersionNo,
                ConfigurationName = configuration.Name,
                ProjectKey = projectKey ?? BlocksContext.GetContext().TenantId,
                AccessModifier = fileResponse.AccessModifier
            };

            _ = StorageTypes.TryGetCategory(configuration.StorageStrategy, out var category);
            var fileInfo = GetFileInfo(fileResponse.ItemId, latestVersion, fileResponse.Name, fileResponse.AccessModifier, category);

            fileUrlRequest.FileName = fileInfo.filePath;
            fileUrlRequest.ExpiryDuration = fileInfo.expiry;

            fileResponse.Url = await storageServiceProvider.GetDownloadUrlAsync(fileUrlRequest) ?? "";
            return fileResponse;
        }

        private static (string filePath, TimeSpan expiry) GetFileInfo(string fileId, string fileVersionId, string fileName, AccessModifier accessModifier, StorageStrategyCategory category)
        {
            switch (category)
            {
                case StorageStrategyCategory.Local:
                    return ("", accessModifier == AccessModifier.Private ? TimeSpan.FromMinutes(30) : TimeSpan.Zero);

                default:
                    {
                        var filePath = accessModifier == AccessModifier.Public
                            ? $"Public/{fileId}/{fileVersionId}/{fileName}"
                            : $"Private/{fileId}/{fileVersionId}/{fileName}";
                        return (filePath, TimeSpan.FromDays(3));
                    }
            }
        }

        public async Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest)
        {
            if (string.IsNullOrWhiteSpace(deleteFileRequest.FileId))
            {
                return CreateErrorResponse<BaseResponse>("empty_file_id", "file_id_should_not_be_empty");
            }

            var configuration = await GetConfigurationAsync(deleteFileRequest.ConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<BaseResponse>("Configuration", ConfigurationNotFound);
            }

            if (!StorageTypes.TryGetCategory(configuration.StorageStrategy, out var category))
                return CreateErrorResponse<BaseResponse>("StorageStrategy", "wrong_storage_strategy_config");

            var existingFile = await _fileRepository.GetFileByItemIdAsync(deleteFileRequest.FileId);

            if (existingFile == null)
            {
                return CreateErrorResponse<BaseResponse>("file_not_found", $"file_with_id_{deleteFileRequest.FileId}_not_exist");
            }

            var storageService = GetStorageService(configuration);
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;

            bool success = await DeleteSingleFileFromStorageAsync(storageService, category, existingFile, tenantId);
            if (success)
                await CleanupDatabaseAsync(existingFile);

            if (!string.IsNullOrWhiteSpace(deleteFileRequest.EventQueueName))
            {
                await _messageClient.SendToConsumerAsync(new ConsumerMessage<DeleteFileRequest>
                {
                    ConsumerName = deleteFileRequest.EventQueueName,
                    Payload = deleteFileRequest
                });
            }

            return CreateSuccessResponse<BaseResponse>();
        }

        private async Task<bool> DeleteSingleFileFromStorageAsync(IStorageService storageService, StorageStrategyCategory category, File file, string? projectKey)
        {
            if (category == StorageStrategyCategory.Local)
            {
                string filePath = string.IsNullOrEmpty(file.TenantId)
                    ? $"{projectKey}/{file.ItemId}"
                    : $"{file.TenantId}/{file.ItemId}";
                return await storageService.DeleteFileAsync(filePath);
            }
            else
            {
                var fileVersionIds = _versionRepository.GetFileVersionIds(file.ItemId);
                await DeleteAllFileVersionsAsync(storageService, file, fileVersionIds);
                return true;
            }
        }

        private static async Task DeleteAllFileVersionsAsync(IStorageService storageService, File existingFile, IEnumerable<string> fileVersionIds)
        {
            foreach (var versionId in fileVersionIds)
            {
                var filePath = DetermineFilePath(existingFile, versionId);
                await storageService.DeleteFileAsync(filePath);
            }
        }

        private static string DetermineFilePath(File existingFile, string versionId)
        {
            var accessModifier = existingFile.AccessModifier == AccessModifier.Public
                ? AccessModifier.Public
                : AccessModifier.Private;

            var fileInfo = GetFileInfo(existingFile.ItemId, versionId, existingFile.Name, accessModifier, StorageStrategyCategory.Cloud);
            return fileInfo.filePath;
        }

        private async Task CleanupDatabaseAsync(File existingFile)
        {
            await _versionRepository.DeleteFileVersionsAsync(existingFile.ItemId);
            await _fileRepository.DeleteFileAsync(existingFile);
        }

        private async Task CleanupDatabaseBulkAsync(IEnumerable<File> files)
        {
            var fileList = files.ToList();
            var itemIds = fileList.Select(f => f.ItemId).ToList();

            await Task.WhenAll(itemIds.Select(_versionRepository.DeleteFileVersionsAsync));

            await _fileRepository.DeleteFilesAsync(fileList);
        }

        private T CreateErrorResponse<T>(string fieldName, string errorMessage) where T : BaseResponse, new()
        {
            return new T
            {
                Errors = new Dictionary<string, string> { { fieldName, errorMessage } },
                IsSuccess = false
            };
        }

        private T CreateSuccessResponse<T>() where T : BaseResponse, new()
        {
            return new T
            {
                IsSuccess = true
            };
        }

        public async Task<BlobClient> GetBlobClientAsync(string tenantId)
        {
            var blobContainerClient = await InitializeBlobContainerClientAsync();
            var blobClient = blobContainerClient.GetBlobClient(tenantId);
            return blobClient;
        }

        private async Task<BlobContainerClient> InitializeBlobContainerClientAsync()
        {
            var configuration = await _configurationRepository.GetConfigurationByNameAsync(Constants.DefaultConfigurationName);
            var blobContainerClient = new BlobContainerClient(configuration.ConnectionString, Constants.CertificateCollectionName);
            await blobContainerClient.CreateIfNotExistsAsync(PublicAccessType.Blob);

            return blobContainerClient;
        }

        public async Task<LocalStorageUploadResponse> UploadFileToLocalStorageAsync(LocalStorageUploadRequest request)
        {
            var validationResult = await _localStorageRequestValidator.ValidateAsync(request);
            if (!validationResult.IsValid)
            {
                return new LocalStorageUploadResponse
                {
                    Errors = validationResult.Errors.ToDictionary(e => e.PropertyName, e => e.ErrorMessage),
                    IsSuccess = false
                };
            }

            var existingFile = string.IsNullOrEmpty(request.ItemId) ? null : await _fileRepository.GetFileByItemIdAsync(request.ItemId);
            return (existingFile != null
                ? await HandleExistingFileForLocalStorageAsync(request, existingFile)
                : await HandleNewFileForLocalStorageAsync(request));
        }

        private async Task<LocalStorageUploadResponse> HandleExistingFileForLocalStorageAsync(LocalStorageUploadRequest request, File existingFile)
        {
            var latestFileVersionNumber = await _versionRepository.GetLatestFileVersionNumberAsync(existingFile.ItemId);
            var newFileVersion = CreateNewFileVersion(existingFile.ItemId, latestFileVersionNumber);

            var configuration = await GetLocalStorageConfiguration(request.ConfigurationName);
            if (configuration == null)
            {
                return CreateErrorResponse<LocalStorageUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var storageServiceProvider = GetStorageService(configuration);
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;
            bool success = await storageServiceProvider.UploadFileToSftpAsync(request.Name, tenantId, existingFile.ItemId, newFileVersion.No.ToString(), request.File);

            if (success)
            {
                await _versionRepository.CreateFileVersionAsync(newFileVersion);
            }
            else
            {
                return CreateErrorResponse<LocalStorageUploadResponse>("SftpStorage", "file_upload_to_sftp_failed");
            }

            return new LocalStorageUploadResponse
            {
                FileId = existingFile.ItemId,
                FileVersion = newFileVersion.No,
                IsSuccess = success
            };
        }

        private async Task<LocalStorageUploadResponse> HandleNewFileForLocalStorageAsync(LocalStorageUploadRequest request)
        {
            if (string.IsNullOrEmpty(request.ItemId))
                request.ItemId = Guid.NewGuid().ToString();

            var file = CreateNewFile(request);
            var fileVersion = CreateNewFileVersion(file.ItemId, 0);

            var configuration = await GetLocalStorageConfiguration(request.ConfigurationName);
            if (configuration == null)
            {
                return CreateErrorResponse<LocalStorageUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var storageServiceProvider = GetStorageService(configuration);
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;
            bool success = await storageServiceProvider.UploadFileToSftpAsync(request.Name, tenantId, file.ItemId, fileVersion.No.ToString(), request.File);

            if (success)
            {
                await Task.WhenAll(_fileRepository.CreateFileAsync(file), _versionRepository.CreateFileVersionAsync(fileVersion));
            }
            else
            {
                return CreateErrorResponse<LocalStorageUploadResponse>("SftpStorage", "file_upload_to_sftp_failed");
            }

            return new LocalStorageUploadResponse
            {
                FileId = file.ItemId,
                FileVersion = fileVersion.No,
                IsSuccess = success
            };
        }

        public async Task<DownloadFileResponse> DownloadFileFromLocalStorageAsync(DownloadFileRequest request)
        {
            if (string.IsNullOrEmpty(request.Signature))
            {
                return CreateErrorResponse<DownloadFileResponse>("download_url", "invalid");
            }

            var configuration = await GetLocalStorageConfiguration(request.ConfigurationName);
            if (configuration == null)
            {
                return CreateErrorResponse<DownloadFileResponse>("Configuration", ConfigurationNotFound);
            }
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;
            // Validate signature
            if (!ValidateSignature(request.Signature, tenantId, configuration.SftpSecretKey, out var signatureString, out var signatureError))
                return CreateErrorResponse<DownloadFileResponse>(signatureError.field, signatureError.message);

            if (string.IsNullOrEmpty(signatureString.ItemId))
                return CreateErrorResponse<DownloadFileResponse>("signature", "wrong_signature");

            var existingFile = await _fileRepository.GetFileByItemIdAsync(signatureString.ItemId);

            if (existingFile == null)
                return CreateErrorResponse<DownloadFileResponse>("file_not_found", $"file_with_id_{signatureString.ItemId}_not_exist");

            // Validate access rights
            if (!ValidateAccess(existingFile.TenantId, request.ConfigurationName, signatureString, out var accessError))
                return CreateErrorResponse<DownloadFileResponse>(accessError.field, accessError.message);

            // Validate file version
            if (!ValidateFileVersions(existingFile, signatureString.FileVersion, out var fileValidationResponse))
                return fileValidationResponse;

            var storageServiceProvider = GetStorageService(configuration);
            var fileStream = await storageServiceProvider.DownloadFileAsync(
                fileValidationResponse.FileName,
                existingFile.TenantId,
                fileValidationResponse.FileId,
                fileValidationResponse.FileVersion.ToString());

            if (fileStream == null)
                return CreateErrorResponse<DownloadFileResponse>("download_from_sftp_server", "file_download_failed_from_sftp_server");

            return new DownloadFileResponse
            {
                FileStream = fileStream,
                FileId = fileValidationResponse.FileId,
                FileName = fileValidationResponse.FileName,
                IsSuccess = true
            };
        }

        private async Task<StorageConfiguration?> GetLocalStorageConfiguration(string? configurationName)
        {
            // Retrieve configuration (custom first, fallback to default sftp)
            var configuration = !string.IsNullOrEmpty(configurationName)
                ? await _configurationRepository.GetConfigurationByNameAsync(configurationName)
                : null;

            configuration ??= await _configurationRepository.GetConfigurationByStrategyAsync("SftpStorage");

            return configuration;
        }

        public static bool ValidateSignature(
            string signature,
            string? projectKey,
            string sftpSecretKey,
            out SignatureString signatureString,
            out (string field, string message) errorMessage)
        {
            signatureString = null!;
            errorMessage = default;

            if (!AesEncryptionHelper.TryDecrypt(signature, sftpSecretKey, out string result))
            {
                errorMessage = ("signature", "wrong_signature");
                return false;
            }

            try
            {
                signatureString = JsonSerializer.Deserialize<SignatureString>(result) ?? throw new InvalidOperationException();
            }
            catch
            {
                errorMessage = ("signature", "invalid_signature_format");
                return false;
            }

            if (signatureString == null)
            {
                errorMessage = ("signature", "invalid_signature_format");
                return false;
            }

            return true;
        }

        public static bool ValidateAccess(string? projectKey, string? configuratioName, SignatureString signatureString, out (string field, string message) errorMessage)
        {
            errorMessage = default;

            if (!Enum.TryParse<AccessModifier>(signatureString.AccessModifier, out var accessModifier))
                accessModifier = AccessModifier.Any;

            if (accessModifier == AccessModifier.Private)
            {
                if (projectKey != signatureString.ProjectKey)
                {
                    errorMessage = ("file_access", "access_denied");
                    return false;
                }

                // Validate expiry date
                if (!DateTime.TryParseExact(
                        signatureString.ExpiryUtc,
                        "o",
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind,
                        out var expiryUtc))
                {
                    errorMessage = ("expiry", "wrong_expiry");
                    return false;
                }

                if (DateTime.UtcNow > expiryUtc)
                {
                    errorMessage = ("expiry", "expired");
                    return false;
                }
            }

            if (!string.IsNullOrEmpty(configuratioName) && signatureString.ConfiguratioName != configuratioName)
            {
                errorMessage = ("signature", "invalid_configuration");
            }

            //Add more validation logic here if needed

            return true;
        }

        public bool ValidateFileVersions(File file, long? version, out DownloadFileResponse response)
        {
            var fileVersions = _versionRepository.GetFileVersions(file.ItemId)?.ToList();

            if (fileVersions == null || fileVersions.Count == 0)
            {
                response = CreateErrorResponse<DownloadFileResponse>("file_version_not_found", $"no_versions_found_for_file_id_{file.ItemId}");
                return false;
            }

            long finalVersion;

            if (version.HasValue)
            {
                // Check if the requested version exists
                if (!fileVersions.Any(f => f.No == version.Value))
                {
                    response = CreateErrorResponse<DownloadFileResponse>("file_version_not_found", $"no_version_{version}_found_for_file_id_{file.ItemId}");
                    return false;
                }

                finalVersion = version.Value;
            }
            else
            {
                // Use the latest version (highest number)
                finalVersion = fileVersions.Max(f => f.No);
            }

            response = new DownloadFileResponse
            {
                FileVersion = finalVersion,
                FileId = file.ItemId,
                FileName = file.Name,
                IsSuccess = true,
            };

            return true;
        }

        public async Task<GetFilesInfoResponse> GetFilesInfoAsync(GetFilesInfoRequest query)
        {

            var (data, count) = await _fileRepository.GetFilesInfoAsync<GetFile, GetFilesInfoRequest>(query);


            return new GetFilesInfoResponse
            {
                Data = data,
                TotalCount = count
            };
        }
        public async Task<BaseMutationResponse> UpdateFileAsync(UpdateFileRequest command)
        {

            var validationResult = _fileRequestValidator.Validate(command);
            if (!validationResult.IsValid)
            {

                return new BaseMutationResponse
                {
                    Errors = validationResult.Errors.ToDictionary(x => x.PropertyName, x => x.ErrorMessage)
                };
            }

            var file = await _fileRepository.GetFileByItemIdAsync(command.ItemId);
            if (file == null)
            {

                return new BaseMutationResponse
                {
                    Errors = new Dictionary<string, string>
            {
                { "ItemId", "Not found" }
            }
                };
            }

            // Assuming your File entity has a dictionary property or allows storing additional properties
            file.AdditionalProperties = command.AdditionalProperties ?? file.AdditionalProperties;
            file.LastUpdatedDate = DateTime.Now;
            file.LastUpdatedBy = BlocksContext.GetContext()?.UserId ?? file.ItemId;

            await _fileRepository.UpdateFileAsync(file);


            return new BaseMutationResponse
            {
                IsSuccess = true,
                ItemId = file.ItemId
            };
        }

        public async Task<CreateFileVersionResponse> CreateFileVersionAsync(CreateFileVersionRequest request)
        {
            var existingFile = await _fileRepository.GetFileByItemIdAsync(request.FileId);
            if (existingFile == null)
            {
                return new CreateFileVersionResponse
                {
                    Errors = new Dictionary<string, string> { { "FileId", $"file_with_id_{request.FileId}_not_exist" } },
                };
            }

            var latestFileVersionNumber = await _versionRepository.GetLatestFileVersionNumberAsync(existingFile.ItemId);
            var newFileVersion = CreateNewFileVersion(existingFile.ItemId, latestFileVersionNumber);

            var configuration = await GetConfigurationAsync(request.ConfigurationName);
            if (configuration == null)
            {
                return new CreateFileVersionResponse
                {
                    Errors = new Dictionary<string, string> { { "Configuration", ConfigurationNotFound } },
                };
            }

            var storageServiceProvider = GetStorageService(configuration);

            var fileInfo = GetFileInfo(existingFile.ItemId, newFileVersion.ItemId, existingFile.Name, existingFile.AccessModifier, StorageStrategyCategory.Cloud);
            var preSignedUrl = storageServiceProvider.GeneratePreSignedUploadUrlAsync(fileInfo.filePath, fileInfo.expiry);

            await _versionRepository.CreateFileVersionAsync(newFileVersion);

            return new CreateFileVersionResponse
            {
                VersionNo = newFileVersion.No,
                UploadUrl = preSignedUrl,
                IsSuccess = true
            };
        }
    }
}
