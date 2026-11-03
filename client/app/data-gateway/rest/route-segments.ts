/**
 * A path's segments as the server routes them: ASP.NET matches routes case-insensitively on the percent-decoded
 * path, so each segment is decoded and lower-cased. Empty segments are dropped; a segment that does not decode is
 * null, and each caller decides which side is safe for it. `path` has no query string.
 */
export function routedSegments(path: string): (string | null)[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch {
        return null;
      }
    });
}
