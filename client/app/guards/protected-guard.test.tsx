import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const setUser = vi.fn();
const setImpersonation = vi.fn();
const setInitialized = vi.fn();
const terminate = vi.fn();
const impersonate = vi.fn();
const stopMutate = vi.fn().mockResolvedValue(undefined);
const startMutate = vi.fn().mockResolvedValue(undefined);

const state = {
  isMounted: true,
  me: { data: { id: "u1" } } as { data: { id: string } } | undefined,
  status: {
    data: undefined as unknown,
    isLoading: false,
    isSuccess: true,
  },
  impersonateStore: {
    setImpersonation,
    setInitialized,
    isInitialized: true,
    terminate,
    impersonate,
    isImpersonated: false,
    impersonatedTenantId: null as string | null,
  },
  selectedProject: undefined as { tenantId: string } | undefined,
};

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>(
      "react-router",
    );
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("./public-guard", () => ({
  useAppState: () => ({ isMounted: state.isMounted }),
}));
vi.mock("@/idp/iam/hooks/use-user", () => ({
  useGetMe: () => ({ data: state.me }),
}));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setUser }),
}));
vi.mock("@/hooks/use-impersonation", () => ({
  useImpersonationStatusChecker: () => state.status,
  useStopImpersonation: () => ({ mutateAsync: stopMutate }),
  useStartImpersonation: () => ({ mutateAsync: startMutate }),
}));
vi.mock("@/store/impersonate-store", () => ({
  useImpersonateStore: () => state.impersonateStore,
}));
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: state.selectedProject }),
}));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "blocks-key" }));

import {
  ImpersonationChecker,
  ImpersonationSynchronizer,
  ImpersonationTerminator,
  ImpersonateGuard,
  ProtectedGuard,
} from "./protected-guard";

beforeEach(() => {
  vi.clearAllMocks();
  state.isMounted = true;
  state.me = { data: { id: "u1" } };
  state.status = { data: undefined, isLoading: false, isSuccess: true };
  state.impersonateStore.isInitialized = true;
  state.impersonateStore.isImpersonated = false;
  state.impersonateStore.impersonatedTenantId = null;
  state.selectedProject = undefined;
});
afterEach(() => vi.clearAllMocks());

describe("ProtectedGuard", () => {
  it("renders children and stores the current user when authenticated", async () => {
    render(
      <ProtectedGuard>
        <div>guarded</div>
      </ProtectedGuard>,
    );
    expect(await screen.findByText("guarded")).toBeInTheDocument();
    await waitFor(() => expect(setUser).toHaveBeenCalledWith({ id: "u1" }));
  });

  it("redirects to /login when there is no user", async () => {
    state.me = undefined;
    render(
      <ProtectedGuard>
        <div>guarded</div>
      </ProtectedGuard>,
    );
    expect(screen.queryByText("guarded")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true }),
    );
  });

  it("renders nothing until mounted", () => {
    state.isMounted = false;
    render(
      <ProtectedGuard>
        <div>guarded</div>
      </ProtectedGuard>,
    );
    expect(screen.queryByText("guarded")).not.toBeInTheDocument();
  });
});

describe("ImpersonationChecker", () => {
  it("syncs impersonation state and renders children once ready", async () => {
    state.status = {
      data: {
        impersonated: true,
        originalTenantId: "orig",
        impersonatedTenantId: "imp",
      },
      isLoading: false,
      isSuccess: true,
    };
    render(
      <ImpersonationChecker>
        <div>checked</div>
      </ImpersonationChecker>,
    );
    expect(await screen.findByText("checked")).toBeInTheDocument();
    await waitFor(() =>
      expect(setImpersonation).toHaveBeenCalledWith(true, "orig", "imp"),
    );
    expect(setInitialized).toHaveBeenCalledWith(true);
  });

  it("renders nothing while loading", () => {
    state.status = { data: undefined, isLoading: true, isSuccess: false };
    render(
      <ImpersonationChecker>
        <div>checked</div>
      </ImpersonationChecker>,
    );
    expect(screen.queryByText("checked")).not.toBeInTheDocument();
  });
});

describe("ImpersonationTerminator", () => {
  it("renders children when not impersonated", () => {
    render(
      <ImpersonationTerminator>
        <div>terminated</div>
      </ImpersonationTerminator>,
    );
    expect(screen.getByText("terminated")).toBeInTheDocument();
  });

  it("stops impersonation and hides children while impersonated", async () => {
    state.impersonateStore.isImpersonated = true;
    render(
      <ImpersonationTerminator>
        <div>terminated</div>
      </ImpersonationTerminator>,
    );
    expect(screen.queryByText("terminated")).not.toBeInTheDocument();
    await waitFor(() => expect(stopMutate).toHaveBeenCalled());
  });
});

describe("ImpersonationSynchronizer", () => {
  it("renders children when already impersonated", () => {
    state.impersonateStore.isImpersonated = true;
    render(
      <ImpersonationSynchronizer>
        <div>synced</div>
      </ImpersonationSynchronizer>,
    );
    expect(screen.getByText("synced")).toBeInTheDocument();
  });

  it("starts impersonation when the selected project differs", async () => {
    state.selectedProject = { tenantId: "t-new" };
    render(
      <ImpersonationSynchronizer>
        <div>synced</div>
      </ImpersonationSynchronizer>,
    );
    await waitFor(() =>
      expect(startMutate).toHaveBeenCalledWith({ targeted_tenant_id: "t-new" }),
    );
  });
});

describe("ImpersonateGuard", () => {
  it("mounts the composed impersonation components without error", () => {
    expect(() =>
      render(
        <ImpersonateGuard>
          <div>composed</div>
        </ImpersonateGuard>,
      ),
    ).not.toThrow();
  });
});
