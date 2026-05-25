export const LAST_APP_PATH_KEY = "blocks:last-app-pathname"

export const LOGIN_SUBTREE_PREFIX = "/login"

/** Path is `/login` or `/login/*` — never persist here; never redirect to these as “return”. */
export const isWithinLoginSubtree = (pathname: string): boolean =>
  pathname === LOGIN_SUBTREE_PREFIX || pathname.startsWith(`${LOGIN_SUBTREE_PREFIX}/`)

const DEFAULT_LOGIN_REDIRECT_FALLBACK = "/console"

const isPersistableProtectedPathname = (pathname: string): boolean => {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false
  if (isWithinLoginSubtree(pathname)) return false
  return true
}

/** Record last in-app pathname from protected shells (pathname only). */
export const persistLastVisitedProtectedPath = (pathname: string): void => {
  try {
    if (typeof sessionStorage === "undefined") return
    if (!isPersistableProtectedPathname(pathname)) return
    sessionStorage.setItem(LAST_APP_PATH_KEY, pathname)
  } catch {
    // sessionStorage unavailable or quota
  }
}

/**
 * Destination when an authenticated session hits `/login` without SSO/force-login.
 * Rejects unsafe or login paths to avoid loops / open redirects.
 */
export const getSafeReturnPathFromStorage = (
  fallback: string = DEFAULT_LOGIN_REDIRECT_FALLBACK,
): string => {
  try {
    if (typeof sessionStorage === "undefined") return fallback
    const raw = sessionStorage.getItem(LAST_APP_PATH_KEY)?.trim()
    if (!raw) return fallback
    if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
    const pathnameOnly = raw.split(/[?#]/)[0] ?? ""
    if (!pathnameOnly || pathnameOnly.startsWith("//")) return fallback
    if (isWithinLoginSubtree(pathnameOnly)) return fallback
    return pathnameOnly
  } catch {
    return fallback
  }
}
