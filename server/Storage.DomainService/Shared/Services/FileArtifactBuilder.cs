using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Entities;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Storage;
using System.Diagnostics.CodeAnalysis;
using System.Net;

namespace Storage.DomainService.Shared.Services
{
    [ExcludeFromCodeCoverage]
    public class FileArtifactBuilder : ArtifactContext, IArtifact
    {
        public FileArtifactBuilder(IFileRepository fileRepository) : base(fileRepository)
        {
        }

        public async Task<DmsResponse> CreateArtifact(ArtifactBaseRequest command)
        {
            UploadFileRequest uploadFileCommand = (UploadFileRequest)command;

            var fileArtifactCreated = await CreateFileEntry(uploadFileCommand);

            if (!fileArtifactCreated)
            {
                return Response.Build()
                    .WithResult(null)
                    .WithMessage("Failed to create file")
                    .WithStatusCode(HttpStatusCode.BadRequest);
            }

            return Response.Build()
                .WithResult(new { Success = true })
                .WithMessage("File created")
                .WithStatusCode(HttpStatusCode.Created);
        }

        private async Task<bool> CreateFileEntry(UploadFileRequest command)
        {
            var existingFiles = await _fileRepository.GetDmsArtifactByNameAndParentIdAsync(command.ArtifactName, command.ParentId);

            var totalFiles = existingFiles.TotalCount;

            UploadFileRequest uploadFileCommand = command;

            bool fileArtifactCreated = false;

            if (existingFiles != null && totalFiles > 0)
            {
                var maxVersion = existingFiles.DmsArtifacts.Max(x => x.Version);

                fileArtifactCreated = await InsertFileInfo(uploadFileCommand, ++maxVersion);
            }
            else
            {
                fileArtifactCreated = await InsertFileInfo(uploadFileCommand, version: 1);
            }

            return fileArtifactCreated;
        }

        private async Task<bool> InsertFileInfo(UploadFileRequest command, int? version)
        {
            try
            {
                command.FileStorageId = string.IsNullOrEmpty(command.FileStorageId)
                    ? Guid.NewGuid().ToString()
                    : command.FileStorageId;

                var dmsArtifact = CreateFileEntry(
                    command: command,
                    version: version);

                CheckAndUpdateFileSizeAsync(
                    artifact: dmsArtifact,
                    fileStorageId: command.FileStorageId);

                await _fileRepository.SavedmsArtifactAsync(dmsArtifact);

                return true;
            }
            catch (Exception ex)
            {
                return await Task.FromResult(false);
            }
        }

        private static DmsArtifact CreateFileEntry(UploadFileRequest command, int? version)
        {
            var bcontext = BlocksContext.GetContext();
            var dmsArtifact = new DmsArtifact();

            int sequence = (version == null || version == 1) ? 1 : (int)version;

            dmsArtifact.ItemId = command.ItemId ?? Guid.NewGuid().ToString();
            dmsArtifact.Name = command.ArtifactName;
            dmsArtifact.Version = sequence;
            dmsArtifact.Description = command.Description;
            dmsArtifact.CreatedBy = bcontext.UserId;
            dmsArtifact.LastUpdatedBy = bcontext.UserId;
            dmsArtifact.FileStorageId = command.FileStorageId;
            dmsArtifact.ParentId = command.ParentId;
            dmsArtifact.Extension = !string.IsNullOrEmpty(command.ArtifactName) ? System.IO.Path.GetExtension(command.ArtifactName) : null;
            dmsArtifact.ArtifactType = (int)DmsArtifactType.File;
            dmsArtifact.ConfigurationName = command.ConfigurationName;
            dmsArtifact.Tags = command?.Tags;
            dmsArtifact.LastUpdatedDate = DateTime.UtcNow;

            return dmsArtifact;
        }

        private async Task CheckAndUpdateFileSizeAsync(DmsArtifact artifact, string fileStorageId)
        {
            try
            {
                var fileLatestVersion = await _fileRepository.GetFileVersions(fileStorageId);
                
                if (fileLatestVersion == null) return;

                var fileSize = fileLatestVersion.SizeInBytes;

                if (fileSize == 0) return;

                artifact.SizeInBytes = "" + fileSize;
            }
            catch (Exception ex)
            {
            }
        }
    }
}