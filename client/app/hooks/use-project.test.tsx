import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { projectService } from "@/services/project.service";
import { projectService as crossProjectService } from "@/identifier/services/project.service";
import {
  useGetProjects,
  useGetProject,
  useGetAssets,
  useAddAssets,
  useUpdateRepositories,
  useUpdateProject,
  useUpdateTenantGroup,
  useValidateCNameProject,
  useDisableProject,
  useCreateProject,
  useGetMigrationStatus,
} from "./use-project";

vi.mock("@/services/project.service", () => ({
  projectService: { getProjects: vi.fn(), getProject: vi.fn() },
}));

vi.mock("@/identifier/services/project.service", () => ({
  projectService: {
    getAssets: vi.fn(),
    addAssets: vi.fn(),
    repoUpdate: vi.fn(),
    updateTenantGroup: vi.fn(),
    validateCNameProject: vi.fn(),
    disableProject: vi.fn(),
    createProject: vi.fn(),
    getMigrationStatus: vi.fn(),
  },
}));

const storeApi = {
  setProjects: vi.fn(),
  setSelectedProject: vi.fn(),
  setTennantGroup: vi.fn(),
  selectedProject: null as unknown,
};
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => storeApi,
}));

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

const formState = {
  formData: {
    0: {
      name: "My Project",
      isAcceptBlocksTerms: true,
      isUseBlocksExclusively: false,
    },
    1: { assets: [{ full_name: "org/repo", html_url: "http://x", id: 7 }] },
    2: { environments: [{ value: "main" }, { value: "dev" }] },
  } as unknown,
  resetFormData: vi.fn(),
};
vi.mock("@/components/create-project/utils", () => ({
  useCreateProjectFormState: () => formState,
  shortGuidGenerator: () => "abcde",
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (a: unknown) => showSuccessToast(a),
  showErrorToast: (a: unknown) => showErrorToast(a),
}));

describe("use-project query hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeApi.selectedProject = null;
  });

  it("useGetProjects flattens groups and seeds the store", async () => {
    vi.mocked(projectService.getProjects).mockResolvedValue([
      { projects: [{ itemId: "p1" }, { itemId: "p2" }] },
    ] as never);

    const { result } = renderHook(() => useGetProjects("g1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(projectService.getProjects).toHaveBeenCalledWith(0, 100, "g1");
    await waitFor(() =>
      expect(storeApi.setProjects).toHaveBeenCalledWith([
        { itemId: "p1" },
        { itemId: "p2" },
      ]),
    );
    expect(storeApi.setSelectedProject).toHaveBeenCalledWith({ itemId: "p1" });
  });

  it("useGetProject is disabled without a projectId", async () => {
    const { result } = renderHook(() => useGetProject({ projectId: "" }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(projectService.getProject).not.toHaveBeenCalled();
  });

  it("useGetProject fetches when a projectId is present", async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({ itemId: "p" } as never);
    const { result } = renderHook(() => useGetProject({ projectId: "p" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ itemId: "p" });
  });

  it("useGetAssets fetches assets for a tenant group", async () => {
    vi.mocked(crossProjectService.getAssets).mockResolvedValue({
      assets: {},
    } as never);
    const { result } = renderHook(() => useGetAssets("g1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.getAssets).toHaveBeenCalledWith("g1");
  });

  it("useGetMigrationStatus fetches status", async () => {
    vi.mocked(crossProjectService.getMigrationStatus).mockResolvedValue({
      status: "done",
    } as never);
    const { result } = renderHook(() => useGetMigrationStatus("g1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.getMigrationStatus).toHaveBeenCalledWith("g1");
  });
});

describe("use-project mutation hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useAddAssets calls addAssets (by reference)", async () => {
    vi.mocked(crossProjectService.addAssets).mockResolvedValue({} as never);
    const { result } = renderHook(() => useAddAssets(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ tenantGroupId: "g" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.addAssets).toHaveBeenCalledWith(
      { tenantGroupId: "g" },
      expect.anything(),
    );
  });

  it("useUpdateRepositories calls repoUpdate", async () => {
    vi.mocked(crossProjectService.repoUpdate).mockResolvedValue({} as never);
    const { result } = renderHook(() => useUpdateRepositories(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ projectKey: "k" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.repoUpdate).toHaveBeenCalled();
  });

  it("useUpdateProject wraps updateTenantGroup (single arg)", async () => {
    vi.mocked(crossProjectService.updateTenantGroup).mockResolvedValue({} as never);
    const { result } = renderHook(() => useUpdateProject({ projectKey: "k" }), {
      wrapper: createWrapper(),
    });
    const payload = { name: "n", tenantGroupId: "g" };
    result.current.mutate(payload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.updateTenantGroup).toHaveBeenCalledWith(payload);
  });

  it("useUpdateTenantGroup wraps updateTenantGroup (single arg)", async () => {
    vi.mocked(crossProjectService.updateTenantGroup).mockResolvedValue({} as never);
    const { result } = renderHook(
      () => useUpdateTenantGroup({ tenantGroupId: "g" }),
      { wrapper: createWrapper() },
    );
    const payload = { name: "n", tenantGroupId: "g" };
    result.current.mutate(payload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.updateTenantGroup).toHaveBeenCalledWith(payload);
  });

  it("useValidateCNameProject calls validateCNameProject", async () => {
    vi.mocked(crossProjectService.validateCNameProject).mockResolvedValue({} as never);
    const { result } = renderHook(
      () => useValidateCNameProject({ projectKey: "k" }),
      { wrapper: createWrapper() },
    );
    result.current.mutate({ domain: "d" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.validateCNameProject).toHaveBeenCalled();
  });

  it("useDisableProject calls disableProject", async () => {
    vi.mocked(crossProjectService.disableProject).mockResolvedValue({} as never);
    const { result } = renderHook(
      () => useDisableProject({ projectKey: "k" }),
      { wrapper: createWrapper() },
    );
    result.current.mutate({ projectKey: "k" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.disableProject).toHaveBeenCalled();
  });

  it("useCreateProject calls createProject", async () => {
    vi.mocked(crossProjectService.createProject).mockResolvedValue({
      isSuccess: true,
    } as never);
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ name: "p" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crossProjectService.createProject).toHaveBeenCalled();
  });
});
