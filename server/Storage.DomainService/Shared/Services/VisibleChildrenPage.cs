using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public sealed class VisibleChildrenPage
    {
        public List<VisibleChildItem> Items { get; set; } = new();

        /// <summary>Null when the stream is exhausted.</summary>
        public string? NextCursor { get; set; }

        /// <summary>
        /// Raw child count for the directory, before access filtering. Informational only:
        /// it deliberately does not agree with the number of visible items, because
        /// computing a filtered total would mean resolving every child on every page.
        /// </summary>
        public long TotalChildCount { get; set; }

        public bool HasMore { get; set; }
    }
}
