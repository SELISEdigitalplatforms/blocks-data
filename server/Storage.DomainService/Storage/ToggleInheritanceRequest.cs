namespace DomainService.Storage.Dms
{
    public class ToggleInheritanceRequest
    {
        public string ResourceId { get; set; } = string.Empty;

        /// <summary>
        /// Switching this off is rejected unless the resource already carries an allow
        /// entry of its own, since it would otherwise be visible to nobody.
        /// </summary>
        public bool InheritsParentAccess { get; set; }
    }
}
