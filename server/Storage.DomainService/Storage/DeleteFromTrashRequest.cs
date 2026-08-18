namespace DomainService.Storage.Dms
{
    /// <summary>Permanently removes an item that is already in the trash.</summary>
    public class DeleteFromTrashRequest
    {
        public string ResourceId { get; set; } = string.Empty;
    }
}
