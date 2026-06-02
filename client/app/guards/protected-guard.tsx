import {
  useImpersonationStatusChecker,
  useStartImpersonation,
  useStopImpersonation,
} from "@/hooks/use-impersonation";
import { useGetMe } from "@/idp/iam/hooks/use-user";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { ImpersonationRequest } from "@/services/impersonation.service";
import { useImpersonateStore } from "@/store/impersonate-store";
import { useAuthStore } from "@/store/useAuthStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "./public-guard";

export function ProtectedGuard({ children }: { children: React.ReactNode }) {
  const { isMounted } = useAppState();
  const { data } = useGetMe();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMounted) return;
    if (!data) return navigate(`/login`, { replace: true });
    setUser(data.data);
  }, [data, navigate, setUser]);
  if (!isMounted || !data) return null;
  return <>{children}</>;
}

export const ImpersonationChecker = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data, isLoading, isSuccess } = useImpersonationStatusChecker();
  const { setImpersonation, isInitialized, setInitialized } =
    useImpersonateStore();

  useEffect(() => {
    if (!data) return;
    setImpersonation(
      data.impersonated,
      data.originalTenantId,
      data.impersonated ? data.impersonatedTenantId : null,
    );
    setInitialized(true);
  }, [data, setImpersonation, setInitialized]);
  if (isLoading || !isSuccess || !isInitialized) return null;
  return <>{children}</>;
};

export function ImpersonationTerminator({
  children,
}: {
  children: React.ReactNode;
}) {
  const { terminate, isImpersonated } = useImpersonateStore();
  const { mutateAsync } = useStopImpersonation();
  const isTriggering = useRef(false);

  useEffect(() => {
    if (isTriggering.current || !isImpersonated) return;
    isTriggering.current = true;
    mutateAsync(undefined)
      .then(() => {
        terminate(getRuntimeEnv("BLOCKS_X_BLOCKS_KEY"));
        isTriggering.current = false;
      })
      .catch(() => {
        isTriggering.current = false;
      });
  }, [mutateAsync, terminate, isImpersonated]);

  if (isImpersonated || isTriggering.current) return null;
  return <>{children}</>;
}

export function ImpersonationSynchronizer({
  children,
}: {
  children: React.ReactNode;
}) {
  const { impersonate, terminate, isImpersonated, impersonatedTenantId } =
    useImpersonateStore();
  const { mutateAsync: startMutation } = useStartImpersonation();
  const { mutateAsync: stopMutation } = useStopImpersonation();

  const { selectedProject } = useProjectStore();
  const isTriggering = useRef(false);

  useEffect(() => {
    // Stop impersonation if no project but still impersonated
    if (!selectedProject?.tenantId && isImpersonated && !isTriggering.current) {
      isTriggering.current = true;
      stopMutation(undefined)
        .then(() => {
          terminate(getRuntimeEnv("BLOCKS_X_BLOCKS_KEY"));
          isTriggering.current = false;
        })
        .catch(() => {
          isTriggering.current = false;
        });
      return;
    }

    // Start impersonation if project selected and different from current
    if (!selectedProject?.tenantId) return;
    if (selectedProject.tenantId === impersonatedTenantId) return;
    if (isTriggering.current) return;

    isTriggering.current = true;
    const payload: ImpersonationRequest = {
      targeted_tenant_id: selectedProject.tenantId,
    };
    startMutation(payload)
      .then(() => {
        impersonate(
          selectedProject.tenantId,
          getRuntimeEnv("BLOCKS_X_BLOCKS_KEY"),
        );
        isTriggering.current = false;
      })
      .catch(() => {
        isTriggering.current = false;
      });
  }, [
    selectedProject?.tenantId,
    startMutation,
    stopMutation,
    impersonate,
    terminate,
    isImpersonated,
    impersonatedTenantId,
  ]);
  if (!isImpersonated || isTriggering.current) return null;
  return <>{children}</>;
}

/**
 * Composes the three impersonation components together for backward compatibility.
 * - ImpersonationChecker: syncs state from API on mount
 * - ImpersonationSynchronizer: starts impersonation when project changes, stops when project cleared
 * - ImpersonationTerminator: stops impersonation when component unmounts
 */
export function ImpersonateGuard({ children }: { children: React.ReactNode }) {
  return (
    <ImpersonationChecker>
      <ImpersonationSynchronizer>
        <ImpersonationTerminator>{children}</ImpersonationTerminator>
      </ImpersonationSynchronizer>
    </ImpersonationChecker>
  );
}
