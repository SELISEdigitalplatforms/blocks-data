import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
export const useAppState = () => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  return { isMounted };
};
export function PublicGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const { isMounted } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // When an SSO provider (e.g. Apple) posts back to /login with code+state,
  // the middleware converts it to a GET redirect with these params in the URL.
  // We must NOT redirect away while the token exchange is still in progress,
  // otherwise the guard loop: /login → /console → /login → ...
  const isSSOCallback = !!(searchParams.get("code") && searchParams.get("state"));
  const forcePublicLogin = searchParams.get("forceLogin") === "1";
  const isLoginSubtree =
    pathname === "/login" || pathname.startsWith("/login/");
  const skipAuthRedirect = useMemo(
    () => isSSOCallback || forcePublicLogin || isLoginSubtree,
    [forcePublicLogin, isLoginSubtree, isSSOCallback],
  );
  useEffect(() => {
    if (!isMounted) return;
    if (skipAuthRedirect) return;
    if (isAuthenticated) return navigate("/console", { replace: true });
  }, [isAuthenticated, isMounted, navigate, skipAuthRedirect]);
  if (!isMounted || (isAuthenticated && !skipAuthRedirect)) return null;
  return <>{children}</>;
}
