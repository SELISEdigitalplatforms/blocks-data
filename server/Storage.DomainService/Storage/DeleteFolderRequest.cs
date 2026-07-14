using Blocks.Genesis;

namespace DomainService.Storage
{
	public class DeleteFolderRequest
	{
		public required string FolderId { get; set; }
		public string? ConfigurationName { get; set; } = null;
	}
}