using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Entities;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Storage;
using System.Diagnostics.CodeAnalysis;
using System.Net;

namespace Storage.DomainService.Shared.Services
{
    [ExcludeFromCodeCoverage]
    public class FolderArtifactBuilder : ArtifactContext, IArtifact
    {
        public FolderArtifactBuilder(IFileRepository fileRepository) : base(fileRepository)
        {
        }

        public async Task<DmsResponse> CreateArtifact(ArtifactBaseRequest command)
        {
            var existingFolders = await _fileRepository.GetDmsArtifactByNameAndParentIdAsync(command.ArtifactName, command.ParentId);


            var totalFolders = existingFolders.TotalCount;

            bool success = false;
            string itemId = null;

            if (existingFolders != null && totalFolders > 0)
            {
                var maxVersion = existingFolders.DmsArtifacts.Max(x => x.Version);
                (success, itemId) = await InsertFolderInfo(command, ++maxVersion);
            }
            else
            {
                (success, itemId) = await InsertFolderInfo(command, version: 1);
            }

            return Response.Build()
                .WithResult(new { Success = success, FolderId = itemId })
                .WithMessage($"Folder creation status: {success}")
                .WithStatusCode(success ? HttpStatusCode.Created : HttpStatusCode.BadRequest);
        }

        private async Task<(bool Status, string ItemId)> InsertFolderInfo(ArtifactBaseRequest command, int? version)
        {
            try
            {
                var dmsArtifact = CreateDmsArtifact(
                    command: command,
                    version: version);

                await _fileRepository.SavedmsArtifactAsync(dmsArtifact);

                return (true, dmsArtifact.ItemId);
            }
            catch (Exception ex)
            {
                return (false, null);
            }
        }

        private static DmsArtifact CreateDmsArtifact(ArtifactBaseRequest command, int? version)
        {
            var bcontext = BlocksContext.GetContext();
            int sequence = (version == null || version == 1) ? 1 : (int)version;

            var dmsArtifact = new DmsArtifact();

            dmsArtifact.ItemId = command.ItemId ?? Guid.NewGuid().ToString();
            dmsArtifact.Name = command.ArtifactName;
            dmsArtifact.Version = sequence;
            dmsArtifact.Description = command.Description;
            dmsArtifact.CreatedBy = bcontext.UserId;
            dmsArtifact.LastUpdatedBy = bcontext.UserId;
            dmsArtifact.ParentId = command.ParentId;
            dmsArtifact.Extension = null;
            dmsArtifact.ArtifactType = (int)DmsArtifactType.Folder;
            dmsArtifact.Tags = command?.Tags;
            dmsArtifact.ConfigurationName = command.ConfigurationName;
            dmsArtifact.LastUpdatedDate = DateTime.UtcNow;

            return dmsArtifact;
        }
    }
}
