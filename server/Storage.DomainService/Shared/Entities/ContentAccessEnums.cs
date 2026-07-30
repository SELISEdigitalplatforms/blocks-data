namespace Storage.DomainService.Entities
{
    public enum ContentResourceType
    {
        Folder = 1,
        File = 2
    }

    public enum ContentPrincipalType
    {
        User = 1,
        Role = 2,
        Everyone = 3,
        Organization = 4
    }

    /// <summary>
    /// Ordered from least to most capable. A higher permission satisfies every lower
    /// operation: Owner covers Manage, which covers Delete, Edit, Download and View.
    /// The resolver relies on the numeric order, so do not renumber these members.
    /// </summary>
    public enum ContentPermission
    {
        View = 1,
        Download = 2,
        Edit = 3,
        Delete = 4,
        Manage = 5,
        Owner = 6
    }

    public enum ContentEffect
    {
        Allow = 1,
        Deny = 2
    }
}
