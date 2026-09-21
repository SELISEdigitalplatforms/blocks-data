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
        private readonly IFileDirectoryRepository _directoryRepository;
        private readonly IValidator<GetPreSignedUrlForUploadRequest> _requestValidator;
        private readonly IValidator<LocalStorageUploadRequest> _localStorageRequestValidator;
        private readonly IValidator<UpdateFileRequest> _fileRequestValidator;
        private readonly IMessageClient _messageClient;
        private readonly IObjectAccessResolver _accessResolver;
        private readonly IObjectAccessRepository _accessRepository;
        private readonly IObjectItemWriter? _objectItems;
        private readonly IUploadKeyRouter _uploadKeyRouter;
        private readonly IUploadVerificationService _uploadVerificationService;

        private const string ConfigurationNotFound = "configuration_not_found";

        public FileManagementService(
            IFileRepository fileRepository,
            IStorageServiceFactory storageServiceFactory,
            IFileVersionRepository versionRepository,
            IConfigurationRepository configurationRepository,
            IFileDirectoryRepository directoryRepository,
            IValidator<GetPreSignedUrlForUploadRequest> requestValidator,
            IValidator<LocalStorageUploadRequest> localStorageRequestValidator,
            IValidator<UpdateFileRequest> fileRequestValidator,
            IMessageClient messageClient,
            IObjectAccessResolver accessResolver,
            IObjectAccessRepository accessRepository,
            IUploadKeyRouter uploadKeyRouter,
            IUploadVerificationService uploadVerificationService,
            IObjectItemWriter? objectItems = null
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
            _accessResolver = accessResolver;
            _accessRepository = accessRepository;
            _uploadKeyRouter = uploadKeyRouter;
            _uploadVerificationService = uploadVerificationService;
            _objectItems = objectItems;
        }


        public async Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.ParentDirectoryId))
            {
                // Clients can target a module without knowing its physical directory id. The
                // seeded defaults use the enum name as Description (for example
                // "Default_Construct"), while newer directories may populate ModuleName.
                var defaultDirectory = await _directoryRepository
                    .GetDefaultDirectoryByModuleNameAsync(request.ModuleName.ToString());

                if (defaultDirectory is null)
                {
                    return new GetPreSignedUrlForUploadResponse
                    {
                        IsSuccess = false,
                        Errors = new Dictionary<string, string>
                        {
                            [nameof(request.ParentDirectoryId)] = "default_directory_not_found"
                        }
                    };
                }

                request.ParentDirectoryId = defaultDirectory.ItemId;
            }

            var validationResult = await ValidateRequestAsync(request);

            if (!validationResult.IsSuccess)
                return validationResult;

            request.ItemId = string.IsNullOrEmpty(request.ItemId) ? Guid.NewGuid().ToString() : request.ItemId;
            var existingFile = await _fileRepository.GetFileByItemIdAsync(request.ItemId);
            if (existingFile is not null && !await AuthorizeFileAsync(existingFile, ObjectPermission.Edit, "Upload", default))
                return AccessDenied<GetPreSignedUrlForUploadResponse>();
            if (existingFile is null && !await AuthorizeParentEditAsync(request.ParentDirectoryId, "Upload", default))
                return AccessDenied<GetPreSignedUrlForUploadResponse>();
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

            // The storage UI offers only Public/Private (see the Phase 1 storage security plan); the
            // backend, not the client, decides whether completion is required for whichever of the two
            // is selected, so an unparseable or out-of-scope value must be rejected here rather than
            // reach Enum.Parse in CreateNewFileAsync.
            if (!string.IsNullOrWhiteSpace(request.AccessModifier)
                && (!Enum.TryParse<AccessModifier>(request.AccessModifier, ignoreCase: true, out var requestedAccessModifier)
                    || !AccessModifierValidation.AllowedUploadCompletionAccessModifiers.Contains(requestedAccessModifier)))
            {
                return new GetPreSignedUrlForUploadResponse
                {
                    Errors = new Dictionary<string, string> { [nameof(request.AccessModifier)] = "access_modifier_must_be_public_or_private" },
                    FileId = request.ItemId,
                    IsSuccess = false
                };
            }

            return new GetPreSignedUrlForUploadResponse { IsSuccess = true };
        }

        private async Task<GetPreSignedUrlForUploadResponse> HandleExistingFileAsync(GetPreSignedUrlForUploadRequest request, File existingFile)
        {
            var configuration = await GetConfigurationAsync(request.ConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<GetPreSignedUrlForUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var declaredSizeError = ValidateDeclaredSize(request, configuration);
            if (declaredSizeError != null)
            {
                return declaredSizeError;
            }

            var latestFileVersionNumber = await _versionRepository.GetLatestFileVersionNumberAsync(existingFile.ItemId);
            var newFileVersion = CreateNewFileVersion(existingFile.ItemId, latestFileVersionNumber);

            var storageServiceProvider = GetStorageService(configuration);

            // A new version's key is always built from the file's current name (a rename before this
            // upload is reflected), but the file's existing AccessModifier decides routing - it applies
            // at file level, and changing it for one version only is Phase 2, not Phase 1.
            var uploadSession = BuildUploadSession(
                request, storageServiceProvider, configuration, existingFile.AccessModifier, existingFile.ItemId, existingFile.Name, newFileVersion);

            await Task.WhenAll(_versionRepository.CreateFileVersionAsync(newFileVersion));

            return new GetPreSignedUrlForUploadResponse
            {
                UploadUrl = uploadSession.UploadUrl,
                FileId = existingFile.ItemId,
                FileVersionId = newFileVersion.ItemId,
                UploadSessionId = newFileVersion.ItemId,
                UploadUrlExpiresAtUtc = uploadSession.UploadUrlExpiresAtUtc,
                RequiredHeaders = uploadSession.RequiredHeaders,
                UploadCompletionRequired = uploadSession.Routing.UploadCompletionRequired,
                VerificationStatus = uploadSession.Routing.VerificationStatus,
                IsSuccess = true
            };
        }

        private async Task<GetPreSignedUrlForUploadResponse> HandleNewFileAsync(GetPreSignedUrlForUploadRequest request)
        {
            var configuration = await GetConfigurationAsync(request.ConfigurationName);

            if (configuration == null)
            {
                return CreateErrorResponse<GetPreSignedUrlForUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var declaredSizeError = ValidateDeclaredSize(request, configuration);
            if (declaredSizeError != null)
            {
                return declaredSizeError;
            }

            var file = await CreateNewFileAsync(request);
            file.ConfigurationName = configuration.Name;
            var fileVersion = CreateNewFileVersion(file.ItemId, 1);

            var storageServiceProvider = GetStorageService(configuration);

            var uploadSession = BuildUploadSession(
                request, storageServiceProvider, configuration, file.AccessModifier, file.ItemId, file.Name, fileVersion);

            file.Url = uploadSession.UploadUrl;

            await Task.WhenAll(_fileRepository.CreateFileAsync(file),
                               _versionRepository.CreateFileVersionAsync(fileVersion));
            if (_objectItems is not null) await _objectItems.UpsertAsync(file);

            return new GetPreSignedUrlForUploadResponse
            {
                UploadUrl = uploadSession.UploadUrl,
                FileId = file.ItemId,
                FileVersionId = fileVersion.ItemId,
                UploadSessionId = fileVersion.ItemId,
                UploadUrlExpiresAtUtc = uploadSession.UploadUrlExpiresAtUtc,
                RequiredHeaders = uploadSession.RequiredHeaders,
                UploadCompletionRequired = uploadSession.Routing.UploadCompletionRequired,
                VerificationStatus = uploadSession.Routing.VerificationStatus,
                IsSuccess = true
            };
        }

        /// <summary>
        /// Verifies and promotes (or rejects) a Quarantined version. Idempotent: an already-Verified or
        /// already-Rejected version returns its existing outcome without re-verifying, and a concurrent
        /// completion call for the same version loses the atomic claim rather than double-verifying.
        /// </summary>
        public async Task<CompleteUploadResponse> CompleteUploadAsync(CompleteUploadRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FileId) || string.IsNullOrWhiteSpace(request.FileVersionId))
                return CompletionNotFound();

            var file = await _fileRepository.GetFileByItemIdAsync(request.FileId);
            if (file is null)
                return CompletionNotFound();

            if (!await AuthorizeFileAsync(file, ObjectPermission.Edit, "CompleteUpload", default))
                return AccessDenied<CompleteUploadResponse>();

            var version = await _versionRepository.GetFileVersionAsync(request.FileId, request.FileVersionId);
            if (version is null)
                return CompletionNotFound();

            // A version that never required completion (or whose FileId/FileVersionId genuinely don't
            // pair up - GetFileVersionAsync already filters on both) is not this endpoint's business;
            // treat it the same as not-found rather than exposing why.
            if (!version.GetEffectiveUploadCompletionRequired())
                return CompletionNotFound();

            switch (version.GetEffectiveVerificationStatus())
            {
                case FileVerificationStatus.Verified:
                    return CompletedResponse(request, FileVerificationStatus.Verified, null);
                case FileVerificationStatus.Rejected:
                    return CompletedResponse(request, FileVerificationStatus.Rejected, version.RejectionReason);
                case FileVerificationStatus.Quarantined:
                    break;
                default:
                    return CompletionNotFound();
            }

            var configuration = await GetConfigurationAsync(file.ConfigurationName);
            if (configuration == null)
                return CreateErrorResponse<CompleteUploadResponse>("Configuration", ConfigurationNotFound);

            var claimed = await _versionRepository.TryClaimCompletionAsync(
                request.FileId, request.FileVersionId, Constants.CompletionClaimLeaseDuration);

            if (claimed is null)
            {
                // Lost the claim: either a concurrent request is already verifying this exact version, or
                // it finished between our read above and now. Re-read once and hand back whichever outcome
                // actually landed instead of erroring - the plan requires this endpoint stay idempotent.
                var current = await _versionRepository.GetFileVersionAsync(request.FileId, request.FileVersionId);
                return current?.GetEffectiveVerificationStatus() switch
                {
                    FileVerificationStatus.Verified => CompletedResponse(request, FileVerificationStatus.Verified, null),
                    FileVerificationStatus.Rejected => CompletedResponse(request, FileVerificationStatus.Rejected, current.RejectionReason),
                    _ => CreateErrorResponse<CompleteUploadResponse>("FileVersionId", "completion_already_in_progress")
                };
            }

            var storageService = GetStorageService(configuration);
            var verification = await _uploadVerificationService.VerifyAsync(
                storageService, configuration, claimed, request.FileVersionId, file.Name);

            string? finalStorageKey = null;
            if (verification.IsVerified)
            {
                finalStorageKey = StorageKeyBuilder.BuildFinalKey(file.AccessModifier, request.FileId, request.FileVersionId, file.Name);
                await storageService.PromoteCandidateToFinalAsync(verification.CandidateKey!, finalStorageKey);
            }

            // The old quarantine object (and, on rejection, the candidate) are deliberately left in
            // private storage: Phase 1 records enough state to find them, but provider deletion is Phase 3.
            await _versionRepository.CompleteVerificationAsync(
                request.FileId, request.FileVersionId, verification.Status, finalStorageKey, verification.RejectionReason);

            return CompletedResponse(request, verification.Status, verification.RejectionReason);
        }

        private static CompleteUploadResponse CompletionNotFound() => new()
        {
            IsSuccess = false,
            Errors = new Dictionary<string, string> { { "FileVersionId", "file_version_not_found" } }
        };

        private static CompleteUploadResponse CompletedResponse(CompleteUploadRequest request, FileVerificationStatus status, string? rejectionReason) => new()
        {
            FileId = request.FileId,
            FileVersionId = request.FileVersionId,
            VerificationStatus = status,
            RejectionReason = rejectionReason,
            IsSuccess = true
        };

        /// <summary>Rejects a declared size that already exceeds the configured maximum, before any provider call is made.</summary>
        private GetPreSignedUrlForUploadResponse? ValidateDeclaredSize(GetPreSignedUrlForUploadRequest request, StorageConfiguration configuration)
        {
            if (request.SizeInBytes is > 0 && request.SizeInBytes.Value > configuration.GetMaxFileSizeInBytes())
            {
                return CreateErrorResponse<GetPreSignedUrlForUploadResponse>(nameof(request.SizeInBytes), "declared_size_exceeds_maximum_allowed");
            }

            return null;
        }

        /// <summary>
        /// Resolves upload-completion routing for one version, generates its upload URL against the
        /// resulting key (the private quarantine target when completion is required, the legacy final
        /// key otherwise), and stamps the Phase 1 fields onto <paramref name="version"/>. The version is
        /// not persisted here; callers still own when to write it.
        /// </summary>
        private UploadSession BuildUploadSession(
            GetPreSignedUrlForUploadRequest request,
            IStorageService storageServiceProvider,
            StorageConfiguration configuration,
            AccessModifier accessModifier,
            string fileId,
            string fileName,
            FileVersion version)
        {
            var routing = _uploadKeyRouter.ResolveUploadRouting(configuration, accessModifier, fileId, version.ItemId, fileName);
            var expiry = TimeSpan.FromSeconds(configuration.GetUploadUrlExpirySeconds());
            var uploadUrlExpiresAtUtc = DateTime.UtcNow.Add(expiry);

            var uploadUrl = routing.UploadCompletionRequired
                ? storageServiceProvider.GenerateQuarantineUploadUrl(routing.StorageKey, expiry)
                : storageServiceProvider.GeneratePreSignedUploadUrlAsync(routing.StorageKey, expiry);

            version.StorageKey = routing.StorageKey;
            version.FileVerificationStatus = routing.VerificationStatus;
            version.UploadCompletionRequired = routing.UploadCompletionRequired;
            version.UploadUrlExpiresAtUtc = uploadUrlExpiresAtUtc;
            version.ExpectedSizeInBytes = request.SizeInBytes;
            version.ExpectedContentType = request.ContentType;
            version.ExpectedChecksum = request.Checksum;
            version.ChecksumAlgorithm = request.ChecksumAlgorithm;

            return new UploadSession
            {
                UploadUrl = uploadUrl,
                UploadUrlExpiresAtUtc = uploadUrlExpiresAtUtc,
                RequiredHeaders = storageServiceProvider.GetRequiredUploadHeaders(request.ContentType),
                Routing = routing
            };
        }

        private sealed class UploadSession
        {
            public required string UploadUrl { get; init; }
            public required DateTime UploadUrlExpiresAtUtc { get; init; }
            public required Dictionary<string, string> RequiredHeaders { get; init; }
            public required UploadKeyRoutingResult Routing { get; init; }
        }

        private async Task<StorageConfiguration> GetConfigurationAsync(string? configurationName)
        {
            return await _configurationRepository.GetConfigurationByNameAsync(configurationName ?? Constants.DefaultConfigurationName);
        }

        private IStorageService GetStorageService(StorageConfiguration configuration)
        {
            return _storageServiceFactory.GetStorageService(configuration);
        }

        /// <summary>
        /// Builds a new file with the parent's cached ancestry. This keeps a freshly
        /// uploaded file in the same access-inheritance chain as its directory from its
        /// first read; previously it stayed at an empty ancestry until a later rebuild.
        /// </summary>
        private async Task<File> CreateNewFileAsync(dynamic request)
        {
            var now = DateTime.UtcNow;
            var userId = BlocksContext.GetContext()?.UserId ?? string.Empty;

            var tags = ParseTags(request.Tags);


            var meta = string.IsNullOrWhiteSpace(request.MetaData)
                ? new Dictionary<string, MetaValue>()
                : JsonSerializer.Deserialize<Dictionary<string, MetaValue>>(request.MetaData) ?? new Dictionary<string, MetaValue>();

            var parentId = string.IsNullOrWhiteSpace(request.ParentDirectoryId)
                ? null
                : (string)request.ParentDirectoryId;
            var parent = parentId is null ? null : await _directoryRepository.GetDirectoryByItemIDAsync(parentId);
            var ancestorIds = parent is null
                ? new List<string>()
                : (parent.AncestorIds ?? new List<string>()).Concat(new[] { parent.ItemId }).ToList();

            return new File
            {
                Name = request.Name,
                DirectoryId = parentId ?? string.Empty,
                SystemName = request.Name.ToLower(),
                Type = StructureType.File,
                TypeString = StructureType.File.ToString(),
                MetaData = meta,
                Url = string.Empty,
                ItemId = request.ItemId,
                TenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty,
                OrganizationId = BlocksContext.GetContext()?.OrganizationId ?? string.Empty,
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
                ObjectAccessLevel = ParseObjectAccessLevel((string?)request.ObjectAccessLevel),
                CurrentVersion = 1,
                AncestorIds = ancestorIds,
                InheritsParentAccess = request.InheritsParentAccess,
                Extension = Path.GetExtension((string)request.Name).TrimStart('.'),
                ConfigurationName = request.ConfigurationName,
                AdditionalProperties = request.AdditionalProperties ?? new Dictionary<string, string>(),
            };
        }

        /// <summary>Null/empty preserves the pre-existing (allow-all) default; an unrecognized
        /// value is ignored the same way rather than throwing, since validation already refuses it.</summary>
        private static ObjectAccessLevel? ParseObjectAccessLevel(string? value) =>
            !string.IsNullOrWhiteSpace(value) && Enum.TryParse<ObjectAccessLevel>(value, true, out var parsed)
                ? parsed
                : null;

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
                    UploadedBy = BlocksContext.GetContext()?.UserId ?? string.Empty,
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
            var file = await _fileRepository.GetFileByItemIdAsync(request.FileId);
            if (file is null || !await AuthorizeFileAsync(file, ObjectPermission.Download, "Download", default))
                return AccessDenied<FileResponse>();
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

            foreach (var fileId in request.FileIds)
            {
                var file = await _fileRepository.GetFileByItemIdAsync(fileId);
                if (file is null || !await AuthorizeFileAsync(file, ObjectPermission.Download, "Download", default))
                    return new List<FileResponse> { AccessDenied<FileResponse>() };
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
                var storageKey = fileVersionAggregate.Contains("StorageKey") && !fileVersionAggregate["StorageKey"].IsBsonNull
                    ? fileVersionAggregate["StorageKey"].AsString
                    : null;
                var verificationStatus = ParseVerificationStatus(fileVersionAggregate);

                var fileResponse = responses.First(f => f.ItemId.Equals(fileId));
                fileResponse.VerificationStatus = verificationStatus;
                fileResponse.SizeInBytes = fileVersionAggregate["SizeInBytes"].IsBsonNull ? 0 : fileVersionAggregate["SizeInBytes"].AsInt64;

                if (!ReadReadinessPolicy.IsContentReadable(verificationStatus))
                {
                    // Quarantined/Rejected content can never be fetched, whatever the access policy
                    // would otherwise allow. Metadata is still useful, so only the URL is withheld -
                    // no provider call is made at all.
                    fileResponse.Url = string.Empty;
                    fileResponse.IsSuccess = true;
                    finalfileResponse.Add(fileResponse);
                    continue;
                }

                var fileUrlResponse = await GetFileUrlResponse(configuration, projectKey, fileResponse, latestVersionNo, latestVersion, storageKey);

                if (fileUrlResponse.Errors != null)
                {
                    finalfileResponse.Add(fileUrlResponse);
                    return finalfileResponse;
                }

                fileResponse.Url = fileUrlResponse.Url;
                fileResponse.IsSuccess = true;

                finalfileResponse.Add(fileResponse);
            }

            return finalfileResponse;
        }

        /// <summary>Missing/null and an unparseable value both resolve to null, which <see cref="ReadReadinessPolicy"/> treats as legacy-ready.</summary>
        private static FileVerificationStatus? ParseVerificationStatus(BsonDocument fileVersionAggregate)
        {
            if (!fileVersionAggregate.Contains("FileVerificationStatus") || fileVersionAggregate["FileVerificationStatus"].IsBsonNull)
                return null;

            return Enum.TryParse<FileVerificationStatus>(fileVersionAggregate["FileVerificationStatus"].AsString, out var status)
                ? status
                : null;
        }

        private async Task<FileResponse> GetFileUrlResponse(StorageConfiguration configuration, string? projectKey, FileResponse fileResponse, long latestVersionNo, string latestVersion, string? storageKey)
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

            // The version's own StorageKey is the object key it was actually uploaded to.
            // Recomputing the path from the file's current Name breaks once the file has been
            // renamed, since the blob itself is never moved. Only legacy/migrated rows without
            // a persisted StorageKey fall back to the recomputed path.
            fileUrlRequest.FileName = !string.IsNullOrEmpty(storageKey) ? storageKey : fileInfo.filePath;

            // Local storage's signature-based link keeps its own fixed validity window (tied to
            // ValidateSignature, not a provider-signed URL); every cloud provider uses the configured
            // DownloadUrlExpirySeconds instead of the previous hard-coded 3-day duration.
            fileUrlRequest.ExpiryDuration = category == StorageStrategyCategory.Local
                ? fileInfo.expiry
                : TimeSpan.FromSeconds(configuration.GetDownloadUrlExpirySeconds());

            var signedUrl = await storageServiceProvider.GetDownloadUrlAsync(fileUrlRequest);
            fileResponse.Url = signedUrl?.Url ?? "";
            fileResponse.DownloadUrlExpiresAtUtc = signedUrl?.ExpiresAtUtc;
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

        public Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest)
            => DeleteFileAsync(deleteFileRequest, authorizeFile: true, forcePermanent: false);

        public Task<BaseResponse> DeleteFileForDirectoryCascadeAsync(DeleteFileRequest deleteFileRequest)
            => DeleteFileAsync(deleteFileRequest, authorizeFile: false, forcePermanent: true);

        private async Task<BaseResponse> DeleteFileAsync(
            DeleteFileRequest deleteFileRequest, bool authorizeFile, bool forcePermanent)
        {
            if (string.IsNullOrWhiteSpace(deleteFileRequest.FileId))
            {
                return CreateErrorResponse<BaseResponse>("empty_file_id", "file_id_should_not_be_empty");
            }

            var existingFile = await _fileRepository.GetFileByItemIdAsync(deleteFileRequest.FileId);

            if (existingFile == null)
            {
                return CreateErrorResponse<BaseResponse>("file_not_found", $"file_with_id_{deleteFileRequest.FileId}_not_exist");
            }

            if (authorizeFile && !await AuthorizeFileAsync(existingFile, ObjectPermission.Delete, "Delete", default))
                return AccessDenied<BaseResponse>();

            var permanent = forcePermanent || deleteFileRequest.Permanent;
            if (!permanent)
            {
                existingFile.IsArchived = true;
                existingFile.LastUpdatedBy = BlocksContext.GetContext()?.UserId ?? string.Empty;
                existingFile.LastUpdatedDate = DateTime.UtcNow;
                await _fileRepository.UpdateFileAsync(existingFile);
                if (_objectItems is not null) await _objectItems.UpsertAsync(existingFile);

                return CreateSuccessResponse<BaseResponse>();
            }

            var configuration = await GetConfigurationAsync(deleteFileRequest.ConfigurationName ?? existingFile.ConfigurationName);
            if (configuration == null)
            {
                return CreateErrorResponse<BaseResponse>("Configuration", ConfigurationNotFound);
            }

            if (!StorageTypes.TryGetCategory(configuration.StorageStrategy, out var category))
                return CreateErrorResponse<BaseResponse>("StorageStrategy", "wrong_storage_strategy_config");

            var storageService = GetStorageService(configuration);
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;

            bool success = await DeleteSingleFileFromStorageAsync(storageService, category, existingFile, tenantId);
            if (success)
            {
                await CleanupDatabaseAsync(existingFile);
                if (_objectItems is not null) await _objectItems.DeleteAsync(existingFile.ItemId);
            }

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
            await _accessRepository.RevokeAllForResourceAsync(existingFile.ItemId);
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
            if (existingFile is not null && !await AuthorizeFileAsync(existingFile, ObjectPermission.Edit, "Upload", default))
                return AccessDenied<LocalStorageUploadResponse>();
            if (existingFile is null && !await AuthorizeParentEditAsync(request.ParentDirectoryId, "Upload", default))
                return AccessDenied<LocalStorageUploadResponse>();
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
            newFileVersion.StorageKey = BuildLocalStorageKey(tenantId, existingFile.ItemId, newFileVersion.No, request.Name);
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

            var configuration = await GetLocalStorageConfiguration(request.ConfigurationName);
            if (configuration == null)
            {
                return CreateErrorResponse<LocalStorageUploadResponse>("Configuration", ConfigurationNotFound);
            }

            var file = await CreateNewFileAsync(request);
            file.ConfigurationName = configuration.Name;
            var fileVersion = CreateNewFileVersion(file.ItemId, 1);

            var storageServiceProvider = GetStorageService(configuration);
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId ?? string.Empty;
            fileVersion.StorageKey = BuildLocalStorageKey(tenantId, file.ItemId, fileVersion.No, request.Name);
            bool success = await storageServiceProvider.UploadFileToSftpAsync(request.Name, tenantId, file.ItemId, fileVersion.No.ToString(), request.File);

            if (success)
            {
                await Task.WhenAll(_fileRepository.CreateFileAsync(file), _versionRepository.CreateFileVersionAsync(fileVersion));
                if (_objectItems is not null) await _objectItems.UpsertAsync(file);
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

            if (!await AuthorizeFileAsync(existingFile, ObjectPermission.Download, "Download", default))
                return AccessDenied<DownloadFileResponse>();

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

            var selectedVersion = fileVersions.First(f => f.No == finalVersion);
            if (!ReadReadinessPolicy.IsContentReadable(selectedVersion.FileVerificationStatus))
            {
                response = CreateErrorResponse<DownloadFileResponse>("file_version_not_available", "content_not_available");
                return false;
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

            if (!await AuthorizeFileAsync(file, ObjectPermission.Edit, "Edit", default))
                return AccessDenied<BaseMutationResponse>();

            // Validated above by _fileRequestValidator: ObjectAccessLevel is either empty
            // (clears the default back to legacy allow-all) or a recognized value.
            if (command.UpdateObjectAccessLevel)
            {
                file.ObjectAccessLevel = ParseObjectAccessLevel(command.ObjectAccessLevel);
            }

            // Assuming your File entity has a dictionary property or allows storing additional properties
            file.AdditionalProperties = command.AdditionalProperties ?? file.AdditionalProperties;
            file.LastUpdatedDate = DateTime.Now;
            file.LastUpdatedBy = BlocksContext.GetContext()?.UserId ?? file.ItemId;

            await _fileRepository.UpdateFileAsync(file);
            if (_objectItems is not null) await _objectItems.UpsertAsync(file);


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

            if (!await AuthorizeFileAsync(existingFile, ObjectPermission.Edit, "Edit", default))
                return new CreateFileVersionResponse
                {
                    IsSuccess = false,
                    Errors = new Dictionary<string, string> { { "access", "forbidden" } },
                };

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
            newFileVersion.StorageKey = fileInfo.filePath;
            var preSignedUrl = storageServiceProvider.GeneratePreSignedUploadUrlAsync(fileInfo.filePath, fileInfo.expiry);

            await _versionRepository.CreateFileVersionAsync(newFileVersion);

            return new CreateFileVersionResponse
            {
                VersionNo = newFileVersion.No,
                UploadUrl = preSignedUrl,
                IsSuccess = true
            };
        }

        private async Task<bool> AuthorizeParentEditAsync(string? directoryId, string action, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(directoryId)) return true; // root upload remains IAM-gated.
            var directory = await _directoryRepository.GetDirectoryByItemIDAsync(directoryId);
            if (directory is null) return false;
            return await AuthorizeAsync(new ObjectResourceDescriptor
            {
                ResourceId = directory.ItemId, AncestorIds = directory.AncestorIds ?? new(),
                InheritsParentAccess = directory.InheritsParentAccess, CreatedBy = directory.CreatedBy,
                OrganizationId = directory.OrganizationId, ObjectAccessLevel = directory.ObjectAccessLevel,
            }, ObjectResourceType.Directory, ObjectPermission.Edit, action, cancellationToken);
        }

        private Task<bool> AuthorizeFileAsync(File file, ObjectPermission permission, string action, CancellationToken cancellationToken) =>
            AuthorizeAsync(new ObjectResourceDescriptor
            {
                ResourceId = file.ItemId, AncestorIds = file.AncestorIds ?? new(),
                InheritsParentAccess = file.InheritsParentAccess, CreatedBy = file.CreatedBy,
                OrganizationId = file.OrganizationId, ObjectAccessLevel = file.ObjectAccessLevel,
            }, ObjectResourceType.File, permission, action, cancellationToken);

        private async Task<bool> AuthorizeAsync(ObjectResourceDescriptor resource, ObjectResourceType resourceType,
            ObjectPermission permission, string action, CancellationToken cancellationToken)
        {
            var granted = await _accessResolver.ResolveAsync(resource, permission, cancellationToken);
            var context = BlocksContext.GetContext();
            var userId = context?.UserId ?? string.Empty;
            await _accessRepository.WriteAuditAsync(new ObjectAuditLog
            {
                ItemId = Guid.NewGuid().ToString(), TenantId = context?.TenantId ?? string.Empty,
                ResourceId = resource.ResourceId, ResourceType = resourceType, UserId = userId,
                Action = action, Granted = granted, Detail = permission.ToString(),
                CreatedDate = DateTime.UtcNow, CreatedBy = userId,
            }, cancellationToken);
            return granted;
        }

        private static T AccessDenied<T>() where T : BaseResponse, new() => new()
        {
            IsSuccess = false,
            Errors = new Dictionary<string, string> { { "access", "forbidden" } },
        };

        private static string BuildLocalStorageKey(string tenantId, string fileId, long version, string fileName) =>
            $"{tenantId}/{fileId}/{version}/{fileName.TrimStart('/')}";
    }
}
