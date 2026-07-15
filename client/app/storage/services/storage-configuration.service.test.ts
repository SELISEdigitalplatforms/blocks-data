import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { STORAGE_CONFIG_ENDPOINTS } from "../constants/endpoint.constant";
import { StorageConfiguration } from "./storage-configuration.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("StorageConfiguration service", () => {
  const service = new StorageConfiguration();

  beforeEach(() => vi.clearAllMocks());

  it("gets normalizes the raw list from the API", async () => {
    vi.mocked(http.get).mockResolvedValue([
      { name: "a", storageStrategy: "Amazon" },
    ]);
    const result = await service.gets("proj-1");
    expect(http.get).toHaveBeenCalledWith(
      `${STORAGE_CONFIG_ENDPOINTS.GET_CONFIGS}?ProjectKey=proj-1`,
      undefined,
      { absoluteUrl: true },
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("save merges Amazon reset values and posts them", async () => {
    vi.mocked(http.post).mockResolvedValue({ isSuccess: true, itemId: "1" });
    await service.save({
      name: "cfg",
      storageStrategy: "Amazon",
      accessKey: "a",
      secretKey: "s",
    } as never);

    const [url, payload] = vi.mocked(http.post).mock.calls[0];
    expect(url).toBe(STORAGE_CONFIG_ENDPOINTS.SAVE_CONFIG);
    // Amazon reset zeroes sftp/azure-only fields while keeping provided keys
    expect(payload).toMatchObject({
      storageStrategy: "Amazon",
      accessKey: "a",
      secretKey: "s",
      host: "",
      connectionString: "",
    });
  });

  it("save applies Azure reset values", async () => {
    vi.mocked(http.post).mockResolvedValue({ isSuccess: true, itemId: "2" });
    await service.save({
      name: "cfg",
      storageStrategy: "Azure",
      connectionString: "conn",
    } as never);
    const [, payload] = vi.mocked(http.post).mock.calls[0];
    expect(payload).toMatchObject({
      connectionString: "conn",
      accessKey: "",
      secretKey: "",
    });
  });

  it("delete posts to the delete endpoint with query params", async () => {
    vi.mocked(http.post).mockResolvedValue({ isSuccess: true });
    await service.delete({ projectKey: "p", configurationName: "cfg" } as never);
    expect(http.post).toHaveBeenCalledWith(
      `${STORAGE_CONFIG_ENDPOINTS.DELETE_CONFIG}?ProjectKey=p&ConfigurationName=cfg`,
      {},
      undefined,
      { absoluteUrl: true },
    );
  });
});
