using System.Text;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Keyset pagination position for a children listing, ordered directorys first, then by
    /// name, with the item id breaking ties so the key is unique and the page boundary is
    /// stable when two siblings share a name.
    /// </summary>
    public sealed class ObjectCursor
    {
        // Unit separator: it cannot appear in a name, so encoding is never ambiguous.
        private const char Separator = '\u001F';

        public StructureType Type { get; init; }
        public string Name { get; init; } = string.Empty;
        public string ItemId { get; init; } = string.Empty;

        public string Encode()
        {
            var raw = $"{(int)Type}{Separator}{Name}{Separator}{ItemId}";
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
        }

        /// <summary>
        /// Returns null for a missing or malformed cursor. A caller that sends a corrupt
        /// cursor gets the first page rather than an error, which keeps a stale bookmark
        /// from turning into a failed request.
        /// </summary>
        public static ObjectCursor? Decode(string? encoded)
        {
            if (string.IsNullOrWhiteSpace(encoded)) return null;

            try
            {
                var raw = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
                var parts = raw.Split(Separator);
                if (parts.Length != 3) return null;
                if (!int.TryParse(parts[0], out var type)) return null;
                if (!Enum.IsDefined(typeof(StructureType), type)) return null;

                return new ObjectCursor
                {
                    Type = (StructureType)type,
                    Name = parts[1],
                    ItemId = parts[2],
                };
            }
            catch (FormatException)
            {
                return null;
            }
        }

        /// <summary>
        /// Orders directorys ahead of files, then by name, then by id. Returns a negative
        /// number when this position sorts before <paramref name="other"/>.
        /// </summary>
        public static int Compare(StructureType leftType, string leftName, string leftId,
                                  StructureType rightType, string rightName, string rightId)
        {
            // StructureType has File = 0 and Directory = 1, so descending puts directorys first.
            var byType = ((int)rightType).CompareTo((int)leftType);
            if (byType != 0) return byType;

            // Ordinal, to match the collation the database sorts and range-scans with.
            // A different comparison here than in the query would drop or repeat items at
            // page boundaries, which is the classic keyset pagination bug.
            var byName = string.CompareOrdinal(leftName, rightName);
            if (byName != 0) return byName;

            return string.Compare(leftId, rightId, StringComparison.Ordinal);
        }

        /// <summary>True when the given item sorts strictly after this cursor position.</summary>
        public bool IsBefore(StructureType type, string name, string itemId) =>
            Compare(Type, Name, ItemId, type, name, itemId) < 0;
    }
}
