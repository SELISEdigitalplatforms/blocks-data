/** `/RT_Blocklist/{itemId}` → `/{itemId}`; `/RT_Blocklist:query` → `:query`; the entity's own route → `/`. */
export const entityRelativePath = (path: string, entityName: string): string => {
  const prefix = `/${entityName}`;
  if (path === prefix) return "/";
  if (path.startsWith(`${prefix}:`)) return path.slice(prefix.length);
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
};
