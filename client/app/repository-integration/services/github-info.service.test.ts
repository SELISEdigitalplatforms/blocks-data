import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { GithubInfoService, githubInfoService } from "./github-info.service";
import { CLOUD_BUILD_ENDPOINTS } from "@/repository-integration/constants/cloud-build-endpoints";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

const PROJECT_KEY = "proj key/with?special";

describe("GithubInfoService", () => {
  let service: GithubInfoService;

  beforeEach(() => {
    service = new GithubInfoService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── verifyAuthorization ─────────────────────────────────────────────────
  describe("verifyAuthorization", () => {
    it("GETs the access-token endpoint with encoded code + project key", async () => {
      vi.mocked(http.get).mockResolvedValue("token-123");

      const result = await service.verifyAuthorization("co de&1", PROJECT_KEY);

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.ACCESS_TOKEN}?code=${encodeURIComponent("co de&1")}&ProjectKey=${encodeURIComponent(PROJECT_KEY)}`,
      );
      expect(result).toBe("token-123");
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.get).mockRejectedValue(new Error("Network error"));
      await expect(service.verifyAuthorization("c", "p")).rejects.toThrow("Network error");
    });
  });

  // ─── checkAlreadyAuthorization ───────────────────────────────────────────
  describe("checkAlreadyAuthorization", () => {
    it("GETs the is-authorized endpoint", async () => {
      const response = { isSuccess: true };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await service.checkAlreadyAuthorization();

      expect(http.get).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.IS_AUTHORIZED);
      expect(result).toEqual(response);
    });
  });

  // ─── revokeAccess ────────────────────────────────────────────────────────
  describe("revokeAccess", () => {
    it("POSTs to the remove-authorization endpoint with empty body", async () => {
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      const result = await service.revokeAccess();

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.REMOVE_AUTHORIZATION, {});
      expect(result).toEqual({ isSuccess: true });
    });
  });

  // ─── removeAuthorization ─────────────────────────────────────────────────
  describe("removeAuthorization", () => {
    it("POSTs to the remove-access-token endpoint with empty body", async () => {
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      const result = await service.removeAuthorization();

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.REMOVE_ACCESS_TOKEN, {});
      expect(result).toEqual({ isSuccess: true });
    });
  });

  // ─── getGithubRepos ──────────────────────────────────────────────────────
  describe("getGithubRepos", () => {
    it("GETs repos with only the project key when no optional params", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: { items: [], total_count: 0 } });

      await service.getGithubRepos("pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_REPOS}?ProjectKey=${encodeURIComponent("pk")}`,
      );
    });

    it("appends search, pageNumber and pageSize when provided", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: { items: [], total_count: 0 } });

      await service.getGithubRepos("pk", "my repo", 2, 25);

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_REPOS}?ProjectKey=${encodeURIComponent("pk")}&search=${encodeURIComponent("my repo")}&pageNumber=2&pageSize=25`,
      );
    });

    it("passes through the API response", async () => {
      const response = {
        data: { items: [{ id: 1 }], total_count: 1 },
        message: null,
        statusCode: 200,
        errors: null,
        isSuccess: true,
      };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await service.getGithubRepos("pk");
      expect(result).toEqual(response);
    });
  });

  // ─── getRepositoryUser ───────────────────────────────────────────────────
  describe("getRepositoryUser", () => {
    it("GETs the github user endpoint with encoded project key", async () => {
      const user = { login: "octocat" };
      vi.mocked(http.get).mockResolvedValue(user);

      const result = await service.getRepositoryUser(PROJECT_KEY);

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_USER}?ProjectKey=${encodeURIComponent(PROJECT_KEY)}`,
      );
      expect(result).toEqual(user);
    });
  });

  // ─── getGithubBranches ───────────────────────────────────────────────────
  describe("getGithubBranches", () => {
    it("GETs branches with encoded repo + project key", async () => {
      vi.mocked(http.get).mockResolvedValue([{ name: "main" }]);

      const result = await service.getGithubBranches("owner/repo", "pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_BRANCHES}?repo=${encodeURIComponent("owner/repo")}&ProjectKey=${encodeURIComponent("pk")}`,
      );
      expect(result).toEqual([{ name: "main" }]);
    });
  });

  // ─── getRepoAndGitBranchMatch ────────────────────────────────────────────
  describe("getRepoAndGitBranchMatch", () => {
    it("GETs the branch-exists endpoint with encoded params", async () => {
      vi.mocked(http.get).mockResolvedValue({ exists: true });

      const result = await service.getRepoAndGitBranchMatch("repo 1", "pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_BRANCH_EXISTS}?repoId=${encodeURIComponent("repo 1")}&ProjectKey=${encodeURIComponent("pk")}`,
      );
      expect(result).toEqual({ exists: true });
    });
  });

  // ─── cloneGithubRepo ─────────────────────────────────────────────────────
  describe("cloneGithubRepo", () => {
    it("POSTs the clone payload to the build/clone endpoint", async () => {
      const payload = { repo: "x" } as never;
      vi.mocked(http.post).mockResolvedValue({ ok: true });

      const result = await service.cloneGithubRepo(payload);

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.BUILD_BUILD, payload);
      expect(result).toEqual({ ok: true });
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(service.cloneGithubRepo({} as never)).rejects.toThrow("Network error");
    });
  });

  // ─── repoInitialDeploy ───────────────────────────────────────────────────
  describe("repoInitialDeploy", () => {
    it("POSTs to the build/run endpoint", async () => {
      const payload = { id: 1 };
      vi.mocked(http.post).mockResolvedValue({ ok: true });

      const result = await service.repoInitialDeploy(payload);

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.RUN_BUILD, payload);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── manualDeploy ────────────────────────────────────────────────────────
  describe("manualDeploy", () => {
    it("POSTs to the build/manual endpoint", async () => {
      const payload = { repoId: "r" } as never;
      vi.mocked(http.post).mockResolvedValue({ ok: true });

      const result = await service.manualDeploy(payload);

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.MANUAL, payload);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── getSpecs ────────────────────────────────────────────────────────────
  describe("getSpecs", () => {
    it("GETs the settings endpoint", async () => {
      vi.mocked(http.get).mockResolvedValue({ cpu: 1 });

      const result = await service.getSpecs();

      expect(http.get).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.SETTINGS);
      expect(result).toEqual({ cpu: 1 });
    });
  });

  // ─── getAllRepos / getAllRepoBuilds ──────────────────────────────────────
  describe("getAllRepos", () => {
    it("GETs the repos endpoint with encoded project key", async () => {
      vi.mocked(http.get).mockResolvedValue([]);

      await service.getAllRepos(PROJECT_KEY);

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.REPOS}?ProjectKey=${encodeURIComponent(PROJECT_KEY)}`,
      );
    });
  });

  describe("getAllRepoBuilds", () => {
    it("GETs the repos endpoint with encoded project key", async () => {
      vi.mocked(http.get).mockResolvedValue([{ build: 1 }]);

      const result = await service.getAllRepoBuilds("pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.REPOS}?ProjectKey=${encodeURIComponent("pk")}`,
      );
      expect(result).toEqual([{ build: 1 }]);
    });
  });

  // ─── getRepoDetails ──────────────────────────────────────────────────────
  describe("getRepoDetails", () => {
    it("GETs the repo-details endpoint with encoded params", async () => {
      vi.mocked(http.get).mockResolvedValue({ id: "r" });

      await service.getRepoDetails("pk", "repo 9");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.REPO_DETAILS}?ProjectKey=${encodeURIComponent("pk")}&RepoId=${encodeURIComponent("repo 9")}`,
      );
    });
  });

  // ─── getCardRepoAndBranches ──────────────────────────────────────────────
  describe("getCardRepoAndBranches", () => {
    it("GETs the build endpoint with encoded buildId + project key", async () => {
      vi.mocked(http.get).mockResolvedValue({ build: 1 });

      await service.getCardRepoAndBranches("build 1", "pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.BUILD}?buildId=${encodeURIComponent("build 1")}&ProjectKey=${encodeURIComponent("pk")}`,
      );
    });
  });

  // ─── changeBuildSpecs (PUT) ──────────────────────────────────────────────
  describe("changeBuildSpecs", () => {
    it("PUTs the payload to the build endpoint", async () => {
      const payload = { cpu: 2 } as never;
      vi.mocked(http.put).mockResolvedValue({ ok: true });

      const result = await service.changeBuildSpecs(payload);

      expect(http.put).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.BUILD, payload);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── changeRepoSpecs (POST) ──────────────────────────────────────────────
  describe("changeRepoSpecs", () => {
    it("POSTs the payload to the settings endpoint", async () => {
      const payload = { branch: "main" } as never;
      vi.mocked(http.post).mockResolvedValue({ ok: true });

      const result = await service.changeRepoSpecs(payload);

      expect(http.post).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.SETTINGS, payload);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── changeRepoSettings (PUT) ────────────────────────────────────────────
  describe("changeRepoSettings", () => {
    it("PUTs the payload to the settings endpoint", async () => {
      const payload = { cpu: 4 } as never;
      vi.mocked(http.put).mockResolvedValue({ ok: true });

      const result = await service.changeRepoSettings(payload);

      expect(http.put).toHaveBeenCalledWith(CLOUD_BUILD_ENDPOINTS.SETTINGS, payload);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── getBuildLogs ────────────────────────────────────────────────────────
  describe("getBuildLogs", () => {
    it("GETs the build/run endpoint with repoId (unencoded) + encoded project key", async () => {
      vi.mocked(http.get).mockResolvedValue({ logs: [] });

      await service.getBuildLogs("repo1", PROJECT_KEY);

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.RUN_BUILD}?repoId=repo1&ProjectKey=${encodeURIComponent(PROJECT_KEY)}`,
      );
    });
  });

  // ─── getRepoCardsAndBranches ─────────────────────────────────────────────
  describe("getRepoCardsAndBranches", () => {
    it("GETs the github repos endpoint with encoded project key", async () => {
      vi.mocked(http.get).mockResolvedValue({ cards: [] });

      await service.getRepoCardsAndBranches("pk");

      expect(http.get).toHaveBeenCalledWith(
        `${CLOUD_BUILD_ENDPOINTS.GITHUB_REPOS}?ProjectKey=${encodeURIComponent("pk")}`,
      );
    });
  });

  // ─── singleton export ────────────────────────────────────────────────────
  it("exports a shared singleton instance", () => {
    expect(githubInfoService).toBeInstanceOf(GithubInfoService);
  });
});
