import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { PROJECT_ENDPOINTS } from "@/identifier/constants/endpoint.constant";
import { ProjectService } from "./project.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("app/services ProjectService", () => {
  const service = new ProjectService();

  beforeEach(() => vi.clearAllMocks());

  it("getProjects builds the paginated url with absolute flag", async () => {
    vi.mocked(http.get).mockResolvedValue([{ tenantGroupId: "g1" }]);
    const res = await service.getProjects(2, 50, "grp");
    expect(http.get).toHaveBeenCalledWith(
      `${PROJECT_ENDPOINTS.GETS}?page=2&pageSize=50&tenantGroupId=grp`,
      undefined,
      { absoluteUrl: true },
    );
    expect(res).toEqual([{ tenantGroupId: "g1" }]);
  });

  it("getProjects applies default arguments", async () => {
    vi.mocked(http.get).mockResolvedValue([]);
    await service.getProjects();
    expect(http.get).toHaveBeenCalledWith(
      `${PROJECT_ENDPOINTS.GETS}?page=0&pageSize=100&tenantGroupId=`,
      undefined,
      { absoluteUrl: true },
    );
  });

  it("getProject builds the url from the projectId", async () => {
    vi.mocked(http.get).mockResolvedValue({ itemId: "p1" });
    const res = await service.getProject({ projectId: "p1" } as never);
    expect(http.get).toHaveBeenCalledWith(
      `${PROJECT_ENDPOINTS.GET}?projectId=p1`,
      undefined,
      { absoluteUrl: true },
    );
    expect(res).toEqual({ itemId: "p1" });
  });
});
