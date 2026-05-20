using Blocks.Genesis;

namespace DomainService.Storage
{
	public class DeleteFolderRequest : IProjectKey
	{
		public required string FolderId { get; set; }
		public string? ConfigurationName { get; set; } = null;
		public string? ProjectKey { get; set; }
	}
}