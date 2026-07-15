import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { githubInfoService } from "@/repository-integration/services/github-info.service";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import {
  useGithubVerification,
  useValidateAuthorization,
  useRevokeAccess,
  useGetGithubRepos,
  useGetRepositoryUser,
  useRemoveAuthorization,
  useGithubBranches,
  useRepoAndGitBranchMatch,
  useGetAllRepoBuilds,
  useGetRepoDetails,
  useInitialRepoDeployment,
  useManualDeployment,
  useGetSpecs,
  useGetCardProjectAndBranch,
  useChangeBuildSpecs,
  useChangeRepoSpecs,
} from "./use-github-integration";

vi.mock("@/repository-integration/services/github-info.service", () => ({
  githubInfoService: {
    verifyAuthorization: vi.fn(),
    checkAlreadyAuthorization: vi.fn(),
    revokeAccess: vi.fn(),
    getGithubRepos: vi.fn(),
    getRepositoryUser: vi.fn(),
    removeAuthorization: vi.fn(),
    getGithubBranches: vi.fn(),
    getRepoAndGitBranchMatch: vi.fn(),
    getAllRepoBuilds: vi.fn(),
    getRepoDetails: vi.fn(),
    repoInitialDeploy: vi.fn(),
    manualDeploy: vi.fn(),
    getSpecs: vi.fn(),
    getCardRepoAndBranches: vi.fn(),
    changeBuildSpecs: vi.fn(),
    changeRepoSpecs: vi.fn(),
  },
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: vi.fn(() => ({ selectedProject: { tenantId: "tenant-1" } })),
}));

describe("use-github-integration hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProjectStore).mockReturnValue({
      selectedProject: { tenantId: "tenant-1" },
    } as never);
  });

  // ─── query hooks ───────────────────────────────────────────────────────────
  describe("useGithubVerification", () => {
    it("verifies the code with the store's tenantId when both are present", async () => {
      vi.mocked(githubInfoService.verifyAuthorization).mockResolvedValue("token");

      const { result } = renderHook(() => useGithubVerification("code-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe("token");
      expect(githubInfoService.verifyAuthorization).toHaveBeenCalledWith("code-1", "tenant-1");
    });

    it("stays disabled when there is no code", async () => {
      const { result } = renderHook(() => useGithubVerification(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.verifyAuthorization).not.toHaveBeenCalled();
    });

    it("stays disabled when the store has no tenantId", async () => {
      vi.mocked(useProjectStore).mockReturnValue({ selectedProject: undefined } as never);

      const { result } = renderHook(() => useGithubVerification("code-1"), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.verifyAuthorization).not.toHaveBeenCalled();
    });
  });

  describe("useValidateAuthorization", () => {
    it("checks existing authorization", async () => {
      vi.mocked(githubInfoService.checkAlreadyAuthorization).mockResolvedValue({ isSuccess: true });

      const { result } = renderHook(() => useValidateAuthorization(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ isSuccess: true });
      expect(githubInfoService.checkAlreadyAuthorization).toHaveBeenCalled();
    });
  });

  describe("useRevokeAccess", () => {
    it("is disabled by default (enabled: false)", () => {
      const { result } = renderHook(() => useRevokeAccess(), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.revokeAccess).not.toHaveBeenCalled();
    });
  });

  describe("useGetGithubRepos", () => {
    it("fetches repos when verification succeeded and tenantId is present", async () => {
      const response = { data: { items: [], total_count: 0 } };
      vi.mocked(githubInfoService.getGithubRepos).mockResolvedValue(response as never);

      const { result } = renderHook(() => useGetGithubRepos(true, "srch", 2, 20), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getGithubRepos).toHaveBeenCalledWith("tenant-1", "srch", 2, 20);
    });

    it("stays disabled when verification has not succeeded", async () => {
      const { result } = renderHook(() => useGetGithubRepos(false), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getGithubRepos).not.toHaveBeenCalled();
    });
  });

  describe("useGetRepositoryUser", () => {
    it("fetches the repository user with the tenantId", async () => {
      vi.mocked(githubInfoService.getRepositoryUser).mockResolvedValue({ login: "octocat" } as never);

      const { result } = renderHook(() => useGetRepositoryUser(true), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getRepositoryUser).toHaveBeenCalledWith("tenant-1");
    });
  });

  describe("useGithubBranches", () => {
    it("fetches branches for a repo", async () => {
      vi.mocked(githubInfoService.getGithubBranches).mockResolvedValue([{ name: "main" }] as never);

      const { result } = renderHook(() => useGithubBranches("owner/repo"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getGithubBranches).toHaveBeenCalledWith("owner/repo", "tenant-1");
    });

    it("stays disabled when repo is empty", async () => {
      const { result } = renderHook(() => useGithubBranches(""), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getGithubBranches).not.toHaveBeenCalled();
    });
  });

  describe("useRepoAndGitBranchMatch", () => {
    it("checks the repo/branch match", async () => {
      vi.mocked(githubInfoService.getRepoAndGitBranchMatch).mockResolvedValue({
        exists: true,
      } as never);

      const { result } = renderHook(() => useRepoAndGitBranchMatch("repo-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getRepoAndGitBranchMatch).toHaveBeenCalledWith("repo-1", "tenant-1");
    });

    it("stays disabled when the enabled flag is false", async () => {
      const { result } = renderHook(() => useRepoAndGitBranchMatch("repo-1", false), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getRepoAndGitBranchMatch).not.toHaveBeenCalled();
    });
  });

  describe("useGetAllRepoBuilds", () => {
    it("fetches all repo builds for a project id", async () => {
      vi.mocked(githubInfoService.getAllRepoBuilds).mockResolvedValue([{ id: 1 }]);

      const { result } = renderHook(() => useGetAllRepoBuilds("proj-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getAllRepoBuilds).toHaveBeenCalledWith("proj-1");
    });

    it("stays disabled when no project id is given", async () => {
      const { result } = renderHook(() => useGetAllRepoBuilds(""), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getAllRepoBuilds).not.toHaveBeenCalled();
    });
  });

  describe("useGetRepoDetails", () => {
    it("fetches repo details for project key + repo id", async () => {
      vi.mocked(githubInfoService.getRepoDetails).mockResolvedValue({ id: "r" });

      const { result } = renderHook(() => useGetRepoDetails("pk", "repo-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getRepoDetails).toHaveBeenCalledWith("pk", "repo-1");
    });

    it("stays disabled when the repo id is missing", async () => {
      const { result } = renderHook(() => useGetRepoDetails("pk", ""), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getRepoDetails).not.toHaveBeenCalled();
    });
  });

  describe("useGetSpecs", () => {
    it("fetches build specs", async () => {
      vi.mocked(githubInfoService.getSpecs).mockResolvedValue({ cpu: 1 });

      const { result } = renderHook(() => useGetSpecs(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getSpecs).toHaveBeenCalled();
    });
  });

  describe("useGetCardProjectAndBranch", () => {
    it("fetches card repo + branches for a build id", async () => {
      vi.mocked(githubInfoService.getCardRepoAndBranches).mockResolvedValue({ build: 1 } as never);

      const { result } = renderHook(() => useGetCardProjectAndBranch("build-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.getCardRepoAndBranches).toHaveBeenCalledWith("build-1", "tenant-1");
    });

    it("stays disabled when build id is empty", async () => {
      const { result } = renderHook(() => useGetCardProjectAndBranch(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(githubInfoService.getCardRepoAndBranches).not.toHaveBeenCalled();
    });
  });

  // ─── mutation hooks ────────────────────────────────────────────────────────
  describe("useRemoveAuthorization", () => {
    it("removes authorization (by-reference mutationFn -> two args)", async () => {
      vi.mocked(githubInfoService.removeAuthorization).mockResolvedValue({ isSuccess: true });

      const { result } = renderHook(() => useRemoveAuthorization(), { wrapper: createWrapper() });

      result.current.mutate();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.removeAuthorization).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
      );
    });
  });

  describe("useInitialRepoDeployment", () => {
    it("deploys the initial repo (wrapped mutationFn -> single arg)", async () => {
      vi.mocked(githubInfoService.repoInitialDeploy).mockResolvedValue({ repoId: "r" });

      const { result } = renderHook(() => useInitialRepoDeployment(), { wrapper: createWrapper() });

      const payload = { branch: "main" } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.repoInitialDeploy).toHaveBeenCalledWith(payload);
    });

    it("reports an error when deployment fails", async () => {
      vi.mocked(githubInfoService.repoInitialDeploy).mockRejectedValue(new Error("deploy failed"));

      const { result } = renderHook(() => useInitialRepoDeployment(), { wrapper: createWrapper() });

      result.current.mutate({} as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useManualDeployment", () => {
    it("triggers a manual deployment (wrapped mutationFn -> single arg)", async () => {
      vi.mocked(githubInfoService.manualDeploy).mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useManualDeployment(), { wrapper: createWrapper() });

      const payload = { repoId: "r" } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.manualDeploy).toHaveBeenCalledWith(payload);
    });
  });

  describe("useChangeBuildSpecs", () => {
    it("changes build specs (wrapped mutationFn -> single arg)", async () => {
      vi.mocked(githubInfoService.changeBuildSpecs).mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useChangeBuildSpecs(), { wrapper: createWrapper() });

      const payload = { cpu: 2 } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.changeBuildSpecs).toHaveBeenCalledWith(payload);
    });
  });

  describe("useChangeRepoSpecs", () => {
    it("changes repo specs (wrapped mutationFn -> single arg)", async () => {
      vi.mocked(githubInfoService.changeRepoSpecs).mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useChangeRepoSpecs(), { wrapper: createWrapper() });

      const payload = { branch: "dev" } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(githubInfoService.changeRepoSpecs).toHaveBeenCalledWith(payload);
    });
  });
});
