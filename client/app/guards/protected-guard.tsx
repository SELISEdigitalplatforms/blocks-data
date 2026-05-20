import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppState } from "./public-guard";
import { useGetUser } from "@/idp/iam/hooks/use-user";
import { useProjectStore } from "@/store/useProjectStore";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { useImpersonationStatusChecker, useStartImpersonation, useStopImpersonation } from "@/hooks/use-impersonation";
import { useImpersonateStore } from "@/store/impersonate-store";
import { ImpersonationRequest } from "@/services/impersonation.service";
import { persistLastVisitedProtectedPath } from "./last-app-path.storage";

const ProtectedLastVisitedPathTracker = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    persistLastVisitedProtectedPath(pathname);
  }, [pathname]);

  return null;
};

export function ProtectedGuard({ children }: { children: React.ReactNode }) {
  const { isMounted } = useAppState();
  const { data } = useGetUser();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMounted) return;
    if (!data) return navigate(`/login`, { replace: true });
    setUser(data.data);
  }, [data, isMounted, navigate, setUser]);
  if (!isMounted || !data) return null;
  return (
    <>
      <ProtectedLastVisitedPathTracker />
      {children}
    </>
  );
}


export const ImpersonationChecker = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { data, isLoading, isSuccess } = useImpersonationStatusChecker()
  const { setImpersonation } = useImpersonateStore()

  useEffect(() => {
    if (!data) return
    setImpersonation(
      data.impersonated,
      data.originalTenantId,
      data.impersonated ? data.impersonatedTenantId : null,
    )
  }, [data, setImpersonation])
  if (isLoading || !isSuccess) return null
  return <>{children}</>
}


export function ImpersonateGuard({ children }: { children: React.ReactNode }) {
  const { startImpersonation, stopImpersonation } = useImpersonateStore();
  const { mutate: startImpersonationMutate } = useStartImpersonation();
  const { mutate: stopImpersonationMutate } = useStopImpersonation();

  const { selectedProject } = useProjectStore();

  const [ready, setReady] = useState(false);
  const impersonateRef = useRef({
    hasStarted: false,
    isCompleted: false,
  });

  useEffect(() => {
    if (!selectedProject?.tenantId) return;
    if (impersonateRef.current.hasStarted) return;

    impersonateRef.current.hasStarted = true;

    const payload: ImpersonationRequest = {
      targetTenantId: selectedProject.tenantId,
    };

    startImpersonationMutate(payload, {
      onSuccess: () => {
        startImpersonation(
          payload.targetTenantId,
          getRuntimeEnv("BLOCKS_X_BLOCKS_KEY"),
        );

        impersonateRef.current.isCompleted = true;
        setReady(true);
      },
      onError: () => {
        impersonateRef.current.hasStarted = false;
      },
    });

    return () => {
      if (!impersonateRef.current.isCompleted) return;

      stopImpersonationMutate(undefined, {
        onSuccess: () => {
          stopImpersonation();
          impersonateRef.current.hasStarted = false;
          impersonateRef.current.isCompleted = false;
          setReady(false);
        },
      });
    };
  }, [
    selectedProject?.tenantId,
    startImpersonationMutate,
    stopImpersonationMutate,
    startImpersonation,
    stopImpersonation,
  ]);

  if (!ready) return null;

  return <>{children}</>;
}
