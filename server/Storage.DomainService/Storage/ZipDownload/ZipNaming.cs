using System.Globalization;
using System.Text;

namespace Storage.DomainService.Storage.ZipDownload;

/// <summary>Helpers that turn user-controlled names into safe zip entry names and a zip file name.</summary>
public static class ZipNaming
{
    private const string Unnamed = "unnamed";

    private static readonly HashSet<char> UnsafeChars = BuildUnsafeChars();

    /// <summary>
    /// Makes a single path segment safe for a zip entry: separators and invalid file-name characters
    /// become <c>_</c>, surrounding spaces are trimmed, and an empty or dots-only result becomes <c>unnamed</c>.
    /// </summary>
    public static string SanitizeSegment(string? name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return Unnamed;
        }

        var sb = new StringBuilder(name.Length);
        foreach (var c in name)
        {
            sb.Append(UnsafeChars.Contains(c) ? '_' : c);
        }

        var result = sb.ToString().Trim(' ');
        return result.Length == 0 || result.All(c => c == '.') ? Unnamed : result;
    }

    /// <summary>
    /// Builds the download's file name: the requested name, else the single selected folder's name,
    /// else <c>download-yyyyMMdd-HHmm</c>; always ending in <c>.zip</c>.
    /// </summary>
    public static string BuildZipName(string? requestedName, string? singleFolderName, DateTime utcNow)
    {
        var baseName = !string.IsNullOrWhiteSpace(requestedName) ? requestedName
            : !string.IsNullOrWhiteSpace(singleFolderName) ? singleFolderName
            : $"download-{utcNow.ToString("yyyyMMdd-HHmm", CultureInfo.InvariantCulture)}";

        var safe = SanitizeSegment(baseName);
        return safe.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) ? safe : safe + ".zip";
    }

    private static HashSet<char> BuildUnsafeChars()
    {
        var set = new HashSet<char>(Path.GetInvalidFileNameChars()) { '/', '\\', ':', '*', '?', '"', '<', '>', '|' };
        return set;
    }
}

/// <summary>
/// Produces unique zip entry paths. Folders and files share one case-insensitive namespace per parent;
/// a clash gets a <c> (n)</c> suffix before the last extension (folders have no extension).
/// </summary>
public sealed class ZipPathBuilder
{
    private readonly Dictionary<string, HashSet<string>> _usedByParent = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Returns the unique path of a folder under <paramref name="parentPath"/> (no trailing slash).</summary>
    public string AddFolder(string parentPath, string name) => Add(parentPath, name, hasExtension: false);

    /// <summary>Returns the unique path of a file under <paramref name="parentPath"/>.</summary>
    public string AddFile(string parentPath, string name) => Add(parentPath, name, hasExtension: true);

    private string Add(string parentPath, string name, bool hasExtension)
    {
        parentPath ??= string.Empty;
        var safe = ZipNaming.SanitizeSegment(name);

        if (!_usedByParent.TryGetValue(parentPath, out var used))
        {
            used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            _usedByParent[parentPath] = used;
        }

        var stem = safe;
        var extension = string.Empty;
        if (hasExtension)
        {
            // A leading dot (".gitignore") is part of the stem, not an extension.
            var dot = safe.LastIndexOf('.');
            if (dot > 0)
            {
                stem = safe[..dot];
                extension = safe[dot..];
            }
        }

        var candidate = safe;
        for (var n = 1; !used.Add(candidate); n++)
        {
            candidate = $"{stem} ({n.ToString(CultureInfo.InvariantCulture)}){extension}";
        }

        return parentPath.Length == 0 ? candidate : $"{parentPath}/{candidate}";
    }
}
