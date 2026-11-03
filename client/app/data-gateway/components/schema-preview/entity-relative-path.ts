/** `/RT_Blocklist/item/{itemId}` → `/item/{itemId}`; the entity's own route → `/`. */
export const entityRelativePath = (path: string, entityName: string): string => {
  const prefix = `/${entityName}`;
  if (path === prefix) return "/";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
};
