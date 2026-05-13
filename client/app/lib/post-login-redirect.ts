const DEFAULT_POST_LOGIN_PATH = "/services/data-gateway"

const isSafeRelativeReturnPath = (path: string): boolean => {
  if (!path.startsWith("/") || path.startsWith("//")) return false
  if (path.includes("..")) return false
  if (path === "/console") return true
  if (path.startsWith("/services/")) return true
  if (path.startsWith("/project-overview/")) return true
  return false
}

export const getPostLoginRedirectPath = (
  searchParams: Pick<URLSearchParams, "get">,
): string => {
  const raw = searchParams.get("return_to")?.trim()
  if (!raw) return DEFAULT_POST_LOGIN_PATH
  if (!isSafeRelativeReturnPath(raw)) return DEFAULT_POST_LOGIN_PATH
  return raw
}
